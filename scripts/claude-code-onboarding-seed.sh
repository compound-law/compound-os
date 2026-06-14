#!/bin/sh
# claude-code-onboarding-seed.sh -- make Claude Code's TUI usable in Docker.
#
# Shannon drives Claude Code through an interactive tmux session so subscription
# auth can be used. If Claude Code has never completed first-run onboarding in
# the container HOME, its TUI blocks on the theme/permission wizard before
# Shannon can submit the prompt. This script normalizes the global config enough
# for Claude Code to boot directly to the prompt while preserving existing
# non-null user preferences.

set -u

HOME_DIR="${1:-${HOME:-/paperclip}}"
CONFIG_PATH="$HOME_DIR/.claude.json"

log() { printf "claude-code-onboarding-seed: %s\n" "$1" >&2; }

case "${PAPERCLIP_CLAUDE_ONBOARDING_SEED_DISABLED:-}" in
    1|true|TRUE|yes|YES)
        log "PAPERCLIP_CLAUDE_ONBOARDING_SEED_DISABLED is set; skipping Claude Code onboarding seed"
        exit 0
        ;;
esac

if ! command -v node >/dev/null 2>&1; then
    log "ERROR: node not found on PATH; cannot update $CONFIG_PATH"
    exit 0
fi

if ! mkdir -p "$HOME_DIR"; then
    log "ERROR: cannot create $HOME_DIR"
    exit 0
fi

if node - "$CONFIG_PATH" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configPath = process.argv[2];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

let config = {};
let existingRaw = "";
let hadInvalidJson = false;

if (fs.existsSync(configPath)) {
  existingRaw = fs.readFileSync(configPath, "utf8");
  const trimmed = existingRaw.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isPlainObject(parsed)) {
        config = parsed;
      } else {
        hadInvalidJson = true;
      }
    } catch {
      hadInvalidJson = true;
    }
  }
}

let changed = hadInvalidJson;

function setWhen(key, value, shouldReplace) {
  if (shouldReplace(config[key])) {
    config[key] = value;
    changed = true;
  }
}

setWhen("hasCompletedOnboarding", true, (value) => value !== true);
setWhen("theme", "dark", (value) => value == null);
setWhen("bypassPermissionsModeAccepted", true, (value) => value !== true);

if (!changed) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(configPath), { recursive: true });

if (hadInvalidJson && existingRaw) {
  fs.writeFileSync(`${configPath}.invalid-${Date.now()}`, existingRaw);
}

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
NODE
then
    log "normalized $CONFIG_PATH for Claude Code TUI startup"
else
    log "ERROR: failed to normalize $CONFIG_PATH"
    exit 0
fi

if command -v chown >/dev/null 2>&1 && id node >/dev/null 2>&1; then
    chown node:node "$CONFIG_PATH" 2>/dev/null || true
fi

exit 0
