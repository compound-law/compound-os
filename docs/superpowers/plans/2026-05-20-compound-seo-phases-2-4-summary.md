# Phases 2-4 — SEO Team Buildout Complete

Date: 2026-05-20T21:53:51+00:00

## All 6 new hires

| Role | UUID | Reports to | Skills |
|---|---|---|---|
| SEO Operations Manager | `160bf032-...` | CEO | 9 |
| Cluster Architect | `a032a0fa-...` | Ops Mgr | 13 |
| Keyword Research Specialist | `bc01d469-...` | Ops Mgr | 11 |
| Competitive Intel Analyst | `e9511093-...` | Ops Mgr | 12 |
| Content Refresh Specialist | `3697a407-...` | Ops Mgr | 11 |
| AI/GEO Citation Monitor | `1255f6a4-...` | Ops Mgr | 11 |

## All 11 new routines

| Routine | Cron | Owner | Next fire (UTC) |
|---|---|---|---|
| Weekly SEO Stand-up | Mon 09:00 Berlin | Ops Mgr | 2026-05-25 07:00 |
| EOW WIP Check | Fri 16:00 Berlin | Ops Mgr | 2026-05-22 14:00 |
| Monthly Budget Review | 1st 09:00 Berlin | Ops Mgr | 2026-06-01 07:00 |
| Bi-weekly Cluster Review | Mon+Thu 10:00 Berlin | Cluster Arch | 2026-05-21 08:00 |
| Daily Keyword Pull | weekdays 07:00 Berlin | Keyword Researcher | 2026-05-21 05:00 |
| Weekly Deep-Research | Wed 09:00 Berlin | Keyword Researcher | 2026-05-27 07:00 |
| Daily Competitor Scan | weekdays 08:00 Berlin | Competitive Intel | 2026-05-21 06:00 |
| Weekly Competitive Landscape | Fri 14:00 Berlin | Competitive Intel | 2026-05-22 12:00 |
| Weekly Drift Scan | Mon 11:00 Berlin | Content Refresh | 2026-05-25 09:00 |
| Weekly AI Citation Scan | Tue+Fri 10:00 Berlin | AI/GEO Monitor | 2026-05-22 08:00 |
| Monthly GEO Restructure | 1st 11:00 Berlin | AI/GEO Monitor | 2026-06-01 09:00 |

## Compound Engineering rolling state

- Agents: 14 (CEO + Strategist + Writer + SEO Engineer + SEO Analyst + Cloudflare Worker Fixer + Wiki Maintainer + Backend Engineer + 6 SEO team additions)
- Active routines: 17 (6 pre-existing + 11 from Phases 2-4)

## Required manual follow-ups

1. **Bind DATAFORSEO_PASSWORD secret** to 4 of the new hires via the operator UI at https://os.compound.law:
   - Keyword Research Specialist (`bc01d469-...`)
   - Competitive Intel Analyst (`e9511093-...`)
   - Content Refresh Specialist (`3697a407-...`)
   - AI/GEO Citation Monitor (`1255f6a4-...`)

2. **First Cluster Architect review fires Thursday morning Berlin** — expect a `request_board_approval` from it shortly after, asking you to approve the first cluster plan before Strategist starts briefing.

3. **Consider archiving Strategist's pre-existing routines** ("Daily Strategy Review" and "Daily Content Planning") that now overlap with Cluster Architect cadence — see Phase 2 summary.

## Spec coverage

Spec called for 13 routines. Plan delivered 11 — the 2 missing are SEO Analyst's daily ranking pulse + weekly performance report, which already exist on the SEO Analyst as pre-existing "Daily SEO Report" (one routine covering both cadences). If you want to formalize them as the spec described (separate daily + weekly), add as a follow-up.
