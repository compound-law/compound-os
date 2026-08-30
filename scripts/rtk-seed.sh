#!/bin/sh
# rtk-seed.sh — idempotently merge RTK hook configs into $HOME.
#
# Called from docker-entrypoint.sh on container boot. Reads baseline hook
# configs from /opt/rtk-defaults/ (baked by the Dockerfile) and merges them
# into the user's $HOME (the /paperclip volume mount).
#
# Behavior:
#   * Bails if PAPERCLIP_RTK_DISABLED is set to anything truthy.
#   * Bails (with warning) if /opt/rtk-defaults/ is missing.
#   * For each baseline file:
#       - target missing               -> straight `cp`
#       - JSON file present            -> jq merge: replace any prior PreToolUse
#                                         entries whose command starts with "rtk hook",
#                                         then append the baseline RTK entry.
#       - opencode rtk.ts present      -> overwrite (RTK-owned file)
#       - codex .codex/ present        -> leave alone, log a warning (TOML merge
#                                         deferred to a future revision)
#
# Cursor is intentionally not seeded -- rtk no longer supports it.
#   * Idempotent: re-running on an already-seeded volume is a no-op.
#
# Exit code is always 0 (failures are logged but non-fatal — the entrypoint
# treats this script as best-effort).

set -u

HOME_DIR="${1:-${HOME:-/paperclip}}"
DEFAULTS_DIR="/opt/rtk-defaults"

log() { printf "rtk-seed: %s\n" "$1" >&2; }

case "${PAPERCLIP_RTK_DISABLED:-}" in
    1|true|TRUE|yes|YES)
        log "PAPERCLIP_RTK_DISABLED is set; skipping RTK hook seeding"
        exit 0
        ;;
esac

if [ ! -d "$DEFAULTS_DIR" ]; then
    log "WARNING: $DEFAULTS_DIR not found; rtk install may have failed during docker build"
    exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
    log "ERROR: jq not found on PATH; cannot merge JSON hook configs"
    exit 0
fi

seed_if_missing() {
    src="$1"
    dst="$2"
    if [ -f "$dst" ]; then
        return 1
    fi
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    log "seeded $dst"
    return 0
}

# Replace any PreToolUse entries whose command starts with "rtk hook" with the
# baseline RTK entries; preserve every other key in dst.
merge_json_hooks() {
    src="$1"
    dst="$2"
    tmp="${dst}.rtk-seed.tmp"

    baseline_entries=$(jq '.hooks.PreToolUse // [] | map(select((.hooks // []) | any(.command | tostring | startswith("rtk hook"))))' "$src")
    if [ "$baseline_entries" = "[]" ]; then
        log "WARNING: $src has no RTK PreToolUse entries; skipping merge"
        return
    fi

    jq --argjson rtk "$baseline_entries" '
        .hooks = (.hooks // {}) |
        .hooks.PreToolUse = (
            ((.hooks.PreToolUse // []) | map(select(((.hooks // []) | any(.command | tostring | startswith("rtk hook"))) | not)))
            + $rtk
        )
    ' "$dst" > "$tmp" && mv "$tmp" "$dst"
    log "merged RTK hook into $dst"
}

# === Claude ===
claude_src="$DEFAULTS_DIR/.claude/settings.json"
claude_dst="$HOME_DIR/.claude/settings.json"
if [ -f "$claude_src" ]; then
    if ! seed_if_missing "$claude_src" "$claude_dst"; then
        merge_json_hooks "$claude_src" "$claude_dst"
    fi
fi

# === opencode ===
opencode_src="$DEFAULTS_DIR/.config/opencode/plugins/rtk.ts"
opencode_dst="$HOME_DIR/.config/opencode/plugins/rtk.ts"
if [ -f "$opencode_src" ]; then
    if ! seed_if_missing "$opencode_src" "$opencode_dst"; then
        cp "$opencode_src" "$opencode_dst"
        log "overwrote $opencode_dst"
    fi
fi

# === Codex ===
# Codex config is TOML; we don't merge. Copy the whole .codex/ tree only when
# the user has no .codex/ directory at all.
codex_src_dir="$DEFAULTS_DIR/.codex"
codex_dst_dir="$HOME_DIR/.codex"
if [ -d "$codex_src_dir" ]; then
    if [ ! -d "$codex_dst_dir" ]; then
        mkdir -p "$codex_dst_dir"
        cp -R "$codex_src_dir/." "$codex_dst_dir/"
        log "seeded $codex_dst_dir"
    else
        log "WARNING: $codex_dst_dir already exists; skipping Codex hook seed (TOML merge not implemented)"
    fi
fi

exit 0
