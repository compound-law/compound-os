# Phase 1 — Skill Rescoping Complete

Date: 2026-05-20T21:16:48+00:00

## Architecture pivot mid-execution

During Task 2 we discovered Paperclip's bundled-skill discovery (server/src/services/company-skills.ts:2183) marks every SKILL.md under /app/skills/ as required=true on every agent. The sync API unions requested+required, so it can never DROP a bundled skill. The original plan's strategy of scoping skills via sync was structurally blocked.

Fix shipped as commit 6f490ee7 on compound branch:
- Dockerfile moves /app/skills/dataforseo-claude/skills/* → /opt/dataforseo-claude-skills/ at build time
- dataforseo-claude-seed.sh extended to seed per-company SKILL.md files from /opt/ → /paperclip/instances/{instance}/skills/{companyId}/dfs-<slug>/SKILL.md at boot
- Target companies controlled by PAPERCLIP_DATAFORSEO_TARGET_COMPANIES env var (default: Compound Engineering only)

After rebuild + container swap, the 13 dataforseo-claude sub-skills register with sourceType=local_path (NOT paperclip_bundled), making per-agent sync work as designed.

## Per-agent final skill set

### CEO (71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9)
Role: ceo · Skills assigned: 8

```
paperclipai/paperclip/diagnose-why-work-stopped
paperclipai/paperclip/paperclip
paperclipai/paperclip/paperclip-converting-plans-to-tasks
paperclipai/paperclip/paperclip-create-agent
paperclipai/paperclip/paperclip-create-plugin
paperclipai/paperclip/paperclip-dev
paperclipai/paperclip/para-memory-files
paperclipai/paperclip/terminal-bench-loop
```

### Content Strategist (2f845f29-009f-450a-b91f-69c95f9b2bd8)
Role: pm · Skills assigned: 11

```
company/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/dataforseo-seo-intelligence
local/7de2b03173/seo-content-gap
local/8508aeb3f5/seo-content
paperclipai/paperclip/diagnose-why-work-stopped
paperclipai/paperclip/paperclip
paperclipai/paperclip/paperclip-converting-plans-to-tasks
paperclipai/paperclip/paperclip-create-agent
paperclipai/paperclip/paperclip-create-plugin
paperclipai/paperclip/paperclip-dev
paperclipai/paperclip/para-memory-files
paperclipai/paperclip/terminal-bench-loop
```

### Content Writer (37d062f6-2b09-4c6b-9baf-96801b8b8930)
Role: general · Skills assigned: 8

```
paperclipai/paperclip/diagnose-why-work-stopped
paperclipai/paperclip/paperclip
paperclipai/paperclip/paperclip-converting-plans-to-tasks
paperclipai/paperclip/paperclip-create-agent
paperclipai/paperclip/paperclip-create-plugin
paperclipai/paperclip/paperclip-dev
paperclipai/paperclip/para-memory-files
paperclipai/paperclip/terminal-bench-loop
```

### SEO Engineer (c1db28a5-2d7d-4c62-b292-85e32dea5912)
Role: engineer · Skills assigned: 12

```
local/3f720c0637/seo-technical
local/b025003064/seo-audit
local/bddefa566b/seo-quick
paperclipai/paperclip/diagnose-why-work-stopped
paperclipai/paperclip/paperclip
paperclipai/paperclip/paperclip-converting-plans-to-tasks
paperclipai/paperclip/paperclip-create-agent
paperclipai/paperclip/paperclip-create-plugin
paperclipai/paperclip/paperclip-dev
paperclipai/paperclip/para-memory-files
paperclipai/paperclip/terminal-bench-loop
resciencelab/opc-skills/seo-geo
```

### SEO Analyst (a2dc5855-61a4-467c-8950-d9a7693e535c)
Role: researcher · Skills assigned: 13

```
company/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/dataforseo-seo-intelligence
local/294b7e9cef/seo-rankings
local/83b6c60e1e/seo-report-pdf
local/a935c2f10d/seo-watchlist
local/eea86dc993/seo-report
paperclipai/paperclip/diagnose-why-work-stopped
paperclipai/paperclip/paperclip
paperclipai/paperclip/paperclip-converting-plans-to-tasks
paperclipai/paperclip/paperclip-create-agent
paperclipai/paperclip/paperclip-create-plugin
paperclipai/paperclip/paperclip-dev
paperclipai/paperclip/para-memory-files
paperclipai/paperclip/terminal-bench-loop
```

## Exclusion audit

OK   71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9 (no seo-orchestrator/semrush)
OK   2f845f29-009f-450a-b91f-69c95f9b2bd8 (no seo-orchestrator/semrush)
OK   37d062f6-2b09-4c6b-9baf-96801b8b8930 (no seo-orchestrator/semrush)
OK   c1db28a5-2d7d-4c62-b292-85e32dea5912 (no seo-orchestrator/semrush)
OK   a2dc5855-61a4-467c-8950-d9a7693e535c (no seo-orchestrator/semrush)


## Verification heartbeat

- Test issue ENG-986 assigned to Content Strategist
- Heartbeat fired without "Usage credits required for 1M context" error
- Agent acknowledged its scoped skill list and marked the issue done

## Notes

- terminal-bench-loop is still auto-bundled on every agent (the only remaining /app/skills/ entry that doesn't belong to the operational baseline). Can be removed from /app/skills/ in a future Dockerfile patch if it's an issue, but its overhead is one skill description (~100 tokens), not worth blocking on.
- The seo orchestrator (formerly paperclipai/paperclip/seo) is gone from /app/skills/ and not imported per company. Assigned to nobody.
- semrush-research never existed in this instance. Not assigned, not in catalog.
