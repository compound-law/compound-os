#!/bin/sh
# dataforseo-claude-seed.sh -- idempotently lay down /paperclip/dataforseo-claude/
# at container boot. Mirrors the rtk-seed pattern.
#
# Reads the image-baked baseline from /opt/dataforseo-claude-defaults/ and copies
# it into /paperclip/dataforseo-claude/ on the persistent volume. Preserves any
# user-provided .env file. Re-running on an already-seeded volume is a no-op
# for .env and a refresh-overwrite for scripts/schema/SKILL.md.
#
# Exit code is always 0 (failures are logged but non-fatal; the entrypoint
# treats this script as best-effort).

set -u

HOME_DIR="${1:-${HOME:-/paperclip}}"
DEFAULTS_DIR="/opt/dataforseo-claude-defaults"
TARGET_DIR="${HOME_DIR}/dataforseo-claude"

log() { printf "dataforseo-claude-seed: %s\n" "$1" >&2; }

case "${PAPERCLIP_DATAFORSEO_SEED_DISABLED:-}" in
    1|true|TRUE|yes|YES)
        log "PAPERCLIP_DATAFORSEO_SEED_DISABLED is set; skipping seed"
        exit 0
        ;;
esac

if [ ! -d "$DEFAULTS_DIR" ]; then
    log "WARNING: $DEFAULTS_DIR not found; dataforseo-claude not baked into image"
    exit 0
fi

mkdir -p "$TARGET_DIR"

# Refresh scripts, schema, SKILL.md, requirements.txt from image baseline on
# every boot -- they are owned by the image, not the user.
for entry in scripts schema SKILL.md requirements.txt; do
    src="$DEFAULTS_DIR/$entry"
    [ -e "$src" ] || continue
    dst="$TARGET_DIR/$entry"
    if [ -d "$src" ]; then
        rm -rf "$dst"
        cp -R "$src" "$dst"
    else
        cp "$src" "$dst"
    fi
done

# Make Python helpers + preflight executable.
chmod +x "$TARGET_DIR/scripts"/*.py "$TARGET_DIR/scripts"/preflight.sh 2>/dev/null || true

log "seeded $TARGET_DIR"
exit 0
