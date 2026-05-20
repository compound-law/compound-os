# DataForSEO Claude — Paperclip vendor

Forked layout of [zubair-trabzada/dataforseo-claude](https://github.com/zubair-trabzada/dataforseo-claude),
rewritten for Paperclip company-skills instead of standalone Claude Code install.

## Layout

- `skills/` — 13 sub-skills (each is its own `SKILL.md`). Mounted at runtime into
  `/paperclip/instances/default/skills/<companyId>/dfs-<name>/SKILL.md`.
- `agents/` — 5 sub-agent specialists. Useful as reference; not auto-mounted.
- `seo/` — shared infra: `scripts/` (Python helpers), `schema/` (input examples),
  `SKILL.md` (the orchestrator). At runtime this lives at
  `/paperclip/dataforseo-claude/` inside the container.
- `requirements.txt` — Python deps for PDF report generation (`reportlab`).

## Path convention

Every `~/.claude/skills/seo/...` reference in the upstream repo has been
rewritten to `/paperclip/dataforseo-claude/...`. That absolute path is stable
inside the container and visible to every agent.

## Credentials

Set `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` as Paperclip secrets on the
agents that need them. The shared `dataforseo_client.py` reads both env vars
and, as a fallback, a `KEY=VALUE` file at `/paperclip/dataforseo-claude/.env`.

## Install (one-time, inside the running container)

```bash
# Inside the paperclip container:
mkdir -p /paperclip/dataforseo-claude
cp -a /<repo>/skills/dataforseo-claude/seo/* /paperclip/dataforseo-claude/
python3 -m venv /paperclip/dataforseo-claude/.venv
/paperclip/dataforseo-claude/.venv/bin/pip install -r /paperclip/dataforseo-claude/requirements.txt httpx
```

Then mirror the 13 `skills/*/SKILL.md` into the live company-skills mount as
`/paperclip/instances/default/skills/<companyId>/dfs-<name>/SKILL.md`.

## Upstream

See `UPSTREAM-README.md` for the original Claude-Code-only install docs.
