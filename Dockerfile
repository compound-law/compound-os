# syntax=docker/dockerfile:1.20
FROM node:lts-trixie-slim AS base
ARG USER_UID=1000
ARG USER_GID=1000
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gosu curl gh git wget ripgrep python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

# Modify the existing node user/group to have the specified UID/GID to match host user
RUN usermod -u $USER_UID --non-unique node \
  && groupmod -g $USER_GID --non-unique node \
  && usermod -g $USER_GID -d /paperclip node

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/skills-catalog/package.json packages/skills-catalog/
COPY packages/teams-catalog/package.json packages/teams-catalog/
COPY packages/adapters/acpx-local/package.json packages/adapters/acpx-local/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-cloud/package.json packages/adapters/cursor-cloud/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/grok-local/package.json packages/adapters/grok-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/
COPY --parents packages/plugins/sandbox-providers/./*/package.json packages/plugins/sandbox-providers/
COPY packages/plugins/paperclip-plugin-fake-sandbox/package.json packages/plugins/paperclip-plugin-fake-sandbox/
COPY packages/plugins/plugin-llm-wiki/package.json packages/plugins/plugin-llm-wiki/
COPY packages/plugins/plugin-workspace-diff/package.json packages/plugins/plugin-workspace-diff/
COPY patches/ patches/
COPY scripts/link-plugin-dev-sdk.mjs scripts/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @paperclipai/ui build
RUN pnpm --filter @paperclipai/plugin-sdk build
# Bake in-tree plugins so their dist/manifest.js exists in the image.
# Without this, plugin install via UI/API succeeds (manifest readable from source)
# but loader fails at activation with "no manifest found" since dist/ is empty.
# Plugins are filtered together so they share an SDK-build invocation cache.
RUN pnpm \
    --filter @paperclipai/plugin-workspace-diff \
    --filter @paperclipai/plugin-llm-wiki \
    build
RUN pnpm --filter @paperclipai/server build
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)
RUN test -f packages/plugins/plugin-workspace-diff/dist/manifest.js || (echo "ERROR: plugin-workspace-diff build output missing" && exit 1)
RUN test -f packages/plugins/plugin-llm-wiki/dist/manifest.js || (echo "ERROR: plugin-llm-wiki build output missing" && exit 1)

FROM base AS production
ARG USER_UID=1000
ARG USER_GID=1000
WORKDIR /app
COPY --chown=node:node --from=build /app /app
RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest opencode-ai @google/gemini-cli@latest @googleworkspace/cli@latest bun@latest @dexh/shannon@latest \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssh-client jq python3-httpx python3-reportlab tmux \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

# Patch @dexh/shannon's sendPrompt so the second-and-onwards user message
# survives the tmux ARG_MAX cap. set-buffer puts the prompt on the command
# line; load-buffer reads from a file. See scripts/patch-shannon-load-buffer.sh
# for the full rationale.
COPY scripts/patch-shannon-load-buffer.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/patch-shannon-load-buffer.sh \
  && /usr/local/bin/patch-shannon-load-buffer.sh

# Bake the dataforseo-claude shared infra into a throwaway dir so it survives
# the /paperclip volume mount. dataforseo-claude-seed.sh (called from entrypoint)
# copies it into /paperclip/dataforseo-claude on container boot.
#
# Also bake the 13 sub-skill SKILL.md files into /opt/dataforseo-claude-skills/
# and then REMOVE dataforseo-claude from /app/skills/. This is critical:
# Paperclip's bundled-skill discovery flags every SKILL.md under /app/skills/ as
# required=true on every agent (server/src/services/company-skills.ts:2183),
# which prevents per-agent skill scoping via the sync API. By staging the
# sub-skills outside /app/skills/, they become available for selective
# per-company import (via the seed script) without forcing them onto every
# agent in every company.
RUN cp -R /app/skills/dataforseo-claude/seo /opt/dataforseo-claude-defaults \
  && cp /app/skills/dataforseo-claude/requirements.txt /opt/dataforseo-claude-defaults/requirements.txt \
  && chmod +x /opt/dataforseo-claude-defaults/scripts/*.py /opt/dataforseo-claude-defaults/scripts/preflight.sh \
  && mkdir -p /opt/dataforseo-claude-skills \
  && cp -R /app/skills/dataforseo-claude/skills/. /opt/dataforseo-claude-skills/ \
  && rm -rf /app/skills/dataforseo-claude

# Install gcloud CLI (required by gws auth setup)
RUN curl -sSL https://sdk.cloud.google.com | bash -s -- --install-dir=/usr/local --disable-prompts \
  && ln -sf /usr/local/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud \
  && ln -sf /usr/local/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil

# Install rtk binary for token-compression hooks (https://github.com/rtk-ai/rtk)
ARG RTK_VERSION=v0.38.0
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh \
    | env RTK_VERSION="${RTK_VERSION}" RTK_INSTALL_DIR=/usr/local/bin sh \
  && rtk --version

# Bake RTK hook configs into a throwaway HOME so they survive the /paperclip volume mount.
# rtk-seed.sh (called from entrypoint) merges these into $HOME on container boot.
RUN mkdir -p /opt/rtk-defaults/.claude \
  && HOME=/opt/rtk-defaults rtk init -g --auto-patch \
  && HOME=/opt/rtk-defaults rtk init -g --opencode \
  && HOME=/opt/rtk-defaults rtk init -g --codex \
  && chown -R node:node /opt/rtk-defaults

COPY scripts/docker-entrypoint.sh scripts/rtk-seed.sh scripts/dataforseo-claude-seed.sh scripts/claude-code-onboarding-seed.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/rtk-seed.sh /usr/local/bin/dataforseo-claude-seed.sh /usr/local/bin/claude-code-onboarding-seed.sh

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  USER_UID=${USER_UID} \
  USER_GID=${USER_GID} \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  OPENCODE_ALLOW_ALL_MODELS=true \
  GEMINI_SANDBOX=false

VOLUME ["/paperclip"]
EXPOSE 3100

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
