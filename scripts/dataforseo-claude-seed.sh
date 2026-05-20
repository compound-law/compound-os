#!/bin/sh
# dataforseo-claude-seed.sh -- idempotently lay down dataforseo-claude infra and
# per-company skill mounts at container boot. Mirrors the rtk-seed pattern.
#
# Two seed operations, both best-effort:
#
# 1. Shared runtime infra:
#    Reads /opt/dataforseo-claude-defaults/ and copies it into
#    $HOME/dataforseo-claude/ on the persistent volume. Refresh-overwrite on
#    every boot for scripts/schema/SKILL.md/requirements.txt; leaves .env
#    alone if the operator has placed one.
#
# 2. Per-company sub-skill mounts:
#    Reads /opt/dataforseo-claude-skills/<slug>/SKILL.md and writes each into
#    $HOME/instances/<instance>/skills/<companyId>/dfs-<slug>/SKILL.md so they
#    are registered with sourceType=local_path (NOT paperclip_bundled, which
#    would force them onto every agent). Target companies come from
#    PAPERCLIP_DATAFORSEO_TARGET_COMPANIES (comma-separated UUIDs), defaulting
#    to Compound Engineering only.
#
# Exit code is always 0 (failures are logged but non-fatal).

set -u

HOME_DIR="${1:-${HOME:-/paperclip}}"
INSTANCE="${PAPERCLIP_INSTANCE_ID:-default}"
DEFAULTS_DIR="/opt/dataforseo-claude-defaults"
SKILLS_DIR="/opt/dataforseo-claude-skills"
SHARED_TARGET="${HOME_DIR}/dataforseo-claude"
TARGET_COMPANIES="${PAPERCLIP_DATAFORSEO_TARGET_COMPANIES:-1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61}"

log() { printf "dataforseo-claude-seed: %s\n" "$1" >&2; }

case "${PAPERCLIP_DATAFORSEO_SEED_DISABLED:-}" in
    1|true|TRUE|yes|YES)
        log "PAPERCLIP_DATAFORSEO_SEED_DISABLED is set; skipping seed"
        exit 0
        ;;
esac

# === Operation 1: shared runtime infra ===

if [ ! -d "$DEFAULTS_DIR" ]; then
    log "WARNING: $DEFAULTS_DIR not found; shared infra not baked into image"
else
    mkdir -p "$SHARED_TARGET"
    for entry in scripts schema SKILL.md requirements.txt; do
        src="$DEFAULTS_DIR/$entry"
        [ -e "$src" ] || continue
        dst="$SHARED_TARGET/$entry"
        if [ -d "$src" ]; then
            rm -rf "$dst"
            cp -R "$src" "$dst"
        else
            cp "$src" "$dst"
        fi
    done
    chmod +x "$SHARED_TARGET/scripts"/*.py "$SHARED_TARGET/scripts"/preflight.sh 2>/dev/null || true
    log "seeded shared infra at $SHARED_TARGET"
fi

# === Operation 2: per-company sub-skill mounts ===

if [ ! -d "$SKILLS_DIR" ]; then
    log "WARNING: $SKILLS_DIR not found; sub-skill SKILL.md files not baked into image"
    exit 0
fi

for cid in $(echo "$TARGET_COMPANIES" | tr ',' ' '); do
    [ -z "$cid" ] && continue
    company_dir="${HOME_DIR}/instances/${INSTANCE}/companies/${cid}"
    if [ ! -d "$company_dir" ]; then
        log "skipping company $cid (not registered in this instance)"
        continue
    fi
    target_root="${HOME_DIR}/instances/${INSTANCE}/skills/${cid}"
    mkdir -p "$target_root"

    count=0
    for skill_src in "$SKILLS_DIR"/*/; do
        slug=$(basename "$skill_src")
        [ -f "$skill_src/SKILL.md" ] || continue
        skill_dir="${target_root}/dfs-${slug}"
        mkdir -p "$skill_dir"
        cp "$skill_src/SKILL.md" "$skill_dir/SKILL.md"
        count=$((count + 1))
    done
    log "seeded $count sub-skill mounts for company $cid"
done

exit 0
