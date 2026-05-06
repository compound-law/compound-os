#!/bin/sh
# rtk-seed.test.sh — exercise scripts/rtk-seed.sh against fixture scenarios.
#
# Pure shell test (no Docker required). Builds a fake /opt/rtk-defaults/ tree
# and a series of fake $HOME directories, runs rtk-seed.sh against each, and
# asserts the merge outcomes.
#
# Run from repo root:    sh scripts/rtk-seed.test.sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED_SCRIPT="$REPO_ROOT/scripts/rtk-seed.sh"

if [ ! -x "$SEED_SCRIPT" ]; then
    echo "FAIL: $SEED_SCRIPT not executable"
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "SKIP: jq not installed; cannot run rtk-seed tests"
    exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

assert() {
    desc="$1"; shift
    if "$@"; then
        PASS=$((PASS + 1))
        printf "  PASS: %s\n" "$desc"
    else
        FAIL=$((FAIL + 1))
        printf "  FAIL: %s\n" "$desc"
    fi
}

# Fake /opt/rtk-defaults
DEFAULTS="$WORK/opt-rtk-defaults"
mkdir -p "$DEFAULTS/.claude" "$DEFAULTS/.cursor" "$DEFAULTS/.config/opencode/plugins" "$DEFAULTS/.codex"

cat > "$DEFAULTS/.claude/settings.json" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "rtk hook claude" } ] }
    ]
  }
}
EOF

cat > "$DEFAULTS/.cursor/hooks.json" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "rtk hook cursor" } ] }
    ]
  }
}
EOF

printf 'export default { /* rtk opencode plugin v1 */ }\n' > "$DEFAULTS/.config/opencode/plugins/rtk.ts"
printf '# rtk codex config v1\n' > "$DEFAULTS/.codex/config.toml"

# Patch the script's DEFAULTS_DIR to point at our fixture tree.
PATCHED_SCRIPT="$WORK/rtk-seed.sh"
sed "s|DEFAULTS_DIR=\"/opt/rtk-defaults\"|DEFAULTS_DIR=\"$DEFAULTS\"|" "$SEED_SCRIPT" > "$PATCHED_SCRIPT"
chmod +x "$PATCHED_SCRIPT"

run_seed() {
    home_dir="$1"
    shift
    "$PATCHED_SCRIPT" "$home_dir" "$@" >/dev/null 2>&1
}

has_rtk_hook() {
    file="$1"
    jq -e '.hooks.PreToolUse | any((.hooks // []) | any(.command | tostring | startswith("rtk hook")))' "$file" >/dev/null 2>&1
}

# === Scenario 1: clean $HOME ===
echo "Scenario 1: clean HOME"
H="$WORK/scenario1"
mkdir -p "$H"
run_seed "$H"
assert "Claude settings.json copied" test -f "$H/.claude/settings.json"
assert "Cursor hooks.json copied" test -f "$H/.cursor/hooks.json"
assert "opencode rtk.ts copied" test -f "$H/.config/opencode/plugins/rtk.ts"
assert "Codex config.toml copied" test -f "$H/.codex/config.toml"
assert "Claude has RTK hook" has_rtk_hook "$H/.claude/settings.json"

# === Scenario 2: existing settings.json with user hooks (no RTK) ===
echo "Scenario 2: existing settings.json with user hooks"
H="$WORK/scenario2"
mkdir -p "$H/.claude"
cat > "$H/.claude/settings.json" <<'EOF'
{
  "theme": "dark",
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo user-hook" } ] }
    ]
  }
}
EOF
run_seed "$H"
assert "user theme preserved" sh -c "[ \"\$(jq -r .theme '$H/.claude/settings.json')\" = dark ]"
assert "user hook preserved" sh -c "jq -r '.hooks.PreToolUse[].hooks[].command' '$H/.claude/settings.json' | grep -q 'echo user-hook'"
assert "RTK hook added" has_rtk_hook "$H/.claude/settings.json"
assert "Two PreToolUse entries" sh -c "[ \"\$(jq '.hooks.PreToolUse | length' '$H/.claude/settings.json')\" = 2 ]"

# === Scenario 3: existing settings.json with stale RTK hook ===
echo "Scenario 3: existing settings.json with stale RTK hook"
H="$WORK/scenario3"
mkdir -p "$H/.claude"
cat > "$H/.claude/settings.json" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "rtk hook claude --old-flag" } ] },
      { "matcher": "Edit", "hooks": [ { "type": "command", "command": "echo user-hook" } ] }
    ]
  }
}
EOF
run_seed "$H"
assert "user hook preserved" sh -c "jq -r '.hooks.PreToolUse[].hooks[].command' '$H/.claude/settings.json' | grep -q 'echo user-hook'"
assert "stale rtk hook replaced" sh -c "! jq -r '.hooks.PreToolUse[].hooks[].command' '$H/.claude/settings.json' | grep -q 'old-flag'"
assert "fresh rtk hook present" sh -c "jq -r '.hooks.PreToolUse[].hooks[].command' '$H/.claude/settings.json' | grep -qx 'rtk hook claude'"

# === Scenario 4: PAPERCLIP_RTK_DISABLED=1 ===
echo "Scenario 4: PAPERCLIP_RTK_DISABLED=1"
H="$WORK/scenario4"
mkdir -p "$H"
PAPERCLIP_RTK_DISABLED=1 run_seed "$H"
assert "no Claude settings seeded" sh -c "[ ! -f '$H/.claude/settings.json' ]"
assert "no Cursor hooks seeded" sh -c "[ ! -f '$H/.cursor/hooks.json' ]"
assert "no opencode plugin seeded" sh -c "[ ! -f '$H/.config/opencode/plugins/rtk.ts' ]"

# === Scenario 5: existing Codex .codex/ left alone ===
echo "Scenario 5: existing Codex .codex dir"
H="$WORK/scenario5"
mkdir -p "$H/.codex"
echo "# my codex config" > "$H/.codex/config.toml"
run_seed "$H"
assert "user codex config preserved" sh -c "grep -q 'my codex config' '$H/.codex/config.toml'"

# === Scenario 6: idempotency ===
echo "Scenario 6: idempotency"
H="$WORK/scenario6"
mkdir -p "$H"
run_seed "$H"
before_hash=$(jq -S . "$H/.claude/settings.json" | sha256sum)
run_seed "$H"
after_hash=$(jq -S . "$H/.claude/settings.json" | sha256sum)
assert "second run is byte-identical" sh -c "[ \"$before_hash\" = \"$after_hash\" ]"

# === Scenario 7: missing /opt/rtk-defaults bails cleanly ===
echo "Scenario 7: missing defaults dir"
H="$WORK/scenario7"
mkdir -p "$H"
PATCHED_NO_DEFAULTS="$WORK/rtk-seed-no-defaults.sh"
sed "s|DEFAULTS_DIR=\"/opt/rtk-defaults\"|DEFAULTS_DIR=\"$WORK/does-not-exist\"|" "$SEED_SCRIPT" > "$PATCHED_NO_DEFAULTS"
chmod +x "$PATCHED_NO_DEFAULTS"
"$PATCHED_NO_DEFAULTS" "$H" >/dev/null 2>&1
rc=$?
assert "exit code is 0 when defaults missing" sh -c "[ $rc = 0 ]"
assert "no files seeded when defaults missing" sh -c "[ -z \"\$(find '$H' -type f 2>/dev/null)\" ]"

echo
echo "Total: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
