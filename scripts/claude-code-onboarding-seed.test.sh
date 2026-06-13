#!/bin/sh
# claude-code-onboarding-seed.test.sh -- exercise the Claude Code config seeder.
#
# Run from repo root:    sh scripts/claude-code-onboarding-seed.test.sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED_SCRIPT="$REPO_ROOT/scripts/claude-code-onboarding-seed.sh"

if [ ! -x "$SEED_SCRIPT" ]; then
    echo "FAIL: $SEED_SCRIPT not executable"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "SKIP: node not installed; cannot run Claude Code onboarding seed tests"
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

assert_equal() {
    desc="$1"
    expected="$2"
    actual="$3"
    if [ "$actual" = "$expected" ]; then
        PASS=$((PASS + 1))
        printf "  PASS: %s\n" "$desc"
    else
        FAIL=$((FAIL + 1))
        printf "  FAIL: %s (expected %s, got %s)\n" "$desc" "$expected" "$actual"
    fi
}

json_value() {
    file="$1"
    expr="$2"
    node -e "const fs = require('node:fs'); const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const value = $expr; process.stdout.write(String(value));" "$file"
}

run_seed() {
    home_dir="$1"
    "$SEED_SCRIPT" "$home_dir" >/dev/null 2>&1
}

# === Scenario 1: null onboarding state from a fresh Docker volume ===
echo "Scenario 1: null onboarding state"
H="$WORK/scenario1"
mkdir -p "$H"
cat > "$H/.claude.json" <<'EOF'
{
  "hasCompletedOnboarding": null,
  "theme": null,
  "bypassPermissionsModeAccepted": null
}
EOF
run_seed "$H"
assert_equal "onboarding marked complete" true "$(json_value "$H/.claude.json" 'data.hasCompletedOnboarding')"
assert_equal "theme defaulted" dark "$(json_value "$H/.claude.json" 'data.theme')"
assert_equal "bypass permission prompt accepted" true "$(json_value "$H/.claude.json" 'data.bypassPermissionsModeAccepted')"

# === Scenario 2: existing user preferences are preserved where safe ===
echo "Scenario 2: existing preferences"
H="$WORK/scenario2"
mkdir -p "$H"
cat > "$H/.claude.json" <<'EOF'
{
  "hasCompletedOnboarding": true,
  "theme": "light",
  "bypassPermissionsModeAccepted": true,
  "custom": "keep-me"
}
EOF
before_hash=$(sha256sum "$H/.claude.json")
run_seed "$H"
after_hash=$(sha256sum "$H/.claude.json")
assert "valid completed config unchanged" sh -c "[ \"$before_hash\" = \"$after_hash\" ]"
assert_equal "custom key preserved" keep-me "$(json_value "$H/.claude.json" 'data.custom')"
assert_equal "user theme preserved" light "$(json_value "$H/.claude.json" 'data.theme')"

# === Scenario 3: missing config file is created ===
echo "Scenario 3: missing config"
H="$WORK/scenario3"
mkdir -p "$H"
run_seed "$H"
assert "config created" test -f "$H/.claude.json"
assert_equal "created config completes onboarding" true "$(json_value "$H/.claude.json" 'data.hasCompletedOnboarding')"

# === Scenario 4: disabled via env ===
echo "Scenario 4: disabled"
H="$WORK/scenario4"
mkdir -p "$H"
PAPERCLIP_CLAUDE_ONBOARDING_SEED_DISABLED=1 run_seed "$H"
assert "disabled seeder leaves config absent" sh -c "[ ! -f '$H/.claude.json' ]"

echo
echo "Total: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
