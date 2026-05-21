#!/bin/sh
set -eu

CAMOFOX_HOME="${CAMOFOX_HOME:-/home/node/.camofox}"

mkdir -p \
  "$CAMOFOX_HOME" \
  "${CAMOFOX_PROFILES_DIR:-$CAMOFOX_HOME/profiles}" \
  "${CAMOFOX_DOWNLOADS_DIR:-$CAMOFOX_HOME/downloads}" \
  "$CAMOFOX_HOME/cookies"

chown -R node:node "$CAMOFOX_HOME"

exec gosu node "$@"
