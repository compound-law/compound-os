# Compound Engineering SEO Team Buildout — Design

Date: 2026-05-20
Author: brainstormed in Claude Code with Mohit Tilwani
Status: design (pre-implementation)

## Goal

Expand the Compound Engineering company (`1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61`) from a 4-agent SEO pipeline (Content Strategist, Content Writer, SEO Engineer, SEO Analyst) into an 11-agent topical-authority team (10 specialists + CEO) capable of driving compound.law's organic and AI-engine citation growth across 7 practice areas (corporate, commercial contracts, employment, IP, data privacy, regulatory compliance, AI Act).

The bottleneck this addresses: **ranking on too few keyword clusters.** The current team is a generalist pipeline with a single Strategist holding both strategy AND tactical brief work. We split that bottleneck and add upstream research depth + downstream measurement specialists.

## Non-goals

- Replacing the existing 4 agents — they keep their roles, with the Strategist narrowed to tactical briefs.
- Building a generic SEO agency that services external clients — focus is compound.law only.
- Backlink prospecting / outreach — that belongs in the GTM company (`5370630d…`) which already has OutboundManager / MessageDrafter for outreach.
- Modeling per-practice-area cluster owners — we picked stage-pipeline depth over topic-ownership depth (decision in design Q2).

## Team roster

11 agents total: CEO + 4 existing specialists + 6 net-new specialists.

```
CEO (existing, 71ac6fdc…)
└── SEO Operations Manager (NEW)
    ├── Research lane
    │   ├── Cluster Architect (NEW)
    │   ├── Keyword Research Specialist (NEW)
    │   └── Competitive Intel Analyst (NEW)
    ├── Production lane
    │   ├── Content Strategist (existing, 2f845f29…, narrowed scope)
    │   ├── Content Writer (existing, 37d062f6…)
    │   └── Content Refresh Specialist (NEW)
    └── Quality + measurement lane
        ├── SEO Engineer (existing, c1db28a5…)
        ├── SEO Analyst (existing, a2dc5855…)
        └── AI/GEO Citation Monitor (NEW)
```

The SEO Operations Manager is a flat coordinator — they do not have authority over individual decisions, only over WIP / blockers / budget. The CEO retains final say on cluster strategy.

### Role of the Cluster Architect (the key new role)

The Content Strategist today owns BOTH cluster strategy (which topics to expand) AND tactical briefs (per-page outlines). The Cluster Architect takes the strategy half. They:

- Synthesize signals from Keyword Researcher + Competitive Intel into a continuously-updated cluster taxonomy (which pillars exist, which spokes are planned, which need new spokes).
- Maintain the internal-linking map (which pages should link to which).
- Propose new cluster expansions to the CEO for approval.
- Once a cluster is approved, hand it to the Content Strategist who turns the plan into individual page briefs.

The Strategist's job after this change is faster and more focused: take an approved cluster, generate briefs for each pillar+spoke page, assign to Writer. No more multi-week strategy thinking competing with same-day brief production.

## Workflow

Per-cluster flow, from research to measurement:

```
Keyword Researcher  ─┐
                     ├──→  Cluster Architect  ──→ (CEO approval gate) ──→  Content Strategist  ──→  Content Writer
Competitive Intel   ─┘     (cluster plan,                                  (per-page briefs)         (EN + DE markdown
                            pillar+spokes,                                                            → PR on law-website-astro)
                            internal-link map)
                                                                                                            │
                                                                                                            ↓
                                                                                                   SEO Engineer
                                                                                                   (tech review, build-gate, merge)
                                                                                                            │
                                                                                                            ↓
                                                                                                ┌───────────┴──────────┐
                                                                                                │                      │
                                                                                          SEO Analyst       AI/GEO Citation Monitor
                                                                                          (Google perf)     (AI-engine citation perf)
                                                                                                │                      │
                                                                                                └──────────┬───────────┘
                                                                                                           │
                                                                                                Content Refresh Specialist
                                                                                                ──→ Writer (decay refreshes)
                                                                                                           │
                                                                                                           ↓
                                                                                                feedback to Cluster Architect
                                                                                                (re-prioritize next clusters)
```

SEO Operations Manager sits across all lanes: weekly stand-up, EOW WIP check, monthly budget review.

## Skill assignment per agent

### Universal baseline (every agent — non-negotiable)

7 skills:

- `paperclip` — coordination, heartbeat procedure
- `para-memory-files` — personal memory in PARA structure
- `paperclip-converting-plans-to-tasks` — plan decomposition
- `paperclip-create-agent` — hiring
- `paperclip-create-plugin` — plugin lifecycle
- `paperclip-dev` — development tooling
- `diagnose-why-work-stopped` — recovery

Token cost: ~700 tokens per agent of always-on skill metadata. Locked.

### Per-agent SEO skill assignments

On top of the universal 7:

| Agent | SEO skills | Total | Notes |
|---|---|---|---|
| CEO | — | 7 | Strategic only |
| SEO Operations Manager | `seo-report` | 8 | Synthesizes weekly stand-up |
| Cluster Architect | `seo-content`, `seo-content-gap`, `seo-quick`, `programmatic-seo`, `ai-seo` | 12 | Broadest research surface |
| Keyword Research Specialist | `seo-keywords`, `seo-quick`, `dataforseo-seo-intelligence` | 10 | Volume + intent + cost-gated batch |
| Competitive Intel Analyst | `seo-competitors`, `seo-watchlist`, `seo-compare`, `seo-backlinks` | 11 | Multi-competitor tracking |
| Content Strategist | `seo-content`, `seo-content-gap`, `dataforseo-seo-intelligence` | 10 | Tactical briefs only |
| Content Writer | — | 7 | Writes from briefs |
| Content Refresh Specialist | `seo-rankings`, `seo-watchlist`, `dataforseo-seo-intelligence` | 10 | Drift detection |
| SEO Engineer | `seo-audit`, `seo-technical`, `seo-quick`, `seo-geo` | 11 | Tech review + schema |
| SEO Analyst | `seo-rankings`, `seo-watchlist`, `dataforseo-seo-intelligence`, `seo-report`, `seo-report-pdf` | 12 | Weekly Google + DataForSEO reports |
| AI/GEO Citation Monitor | `ai-seo`, `seo-geo`, `seo-quick` | 10 | AI-engine citation tracking |

### Explicit exclusions (assigned to nobody)

- **`seo` orchestrator skill** (the dataforseo-claude/seo/SKILL.md, ~12KB) — too heavy, designed for single-user Claude Code, not a specialized team. Each agent gets only the focused sub-skills they need.
- **`semrush-research`** — DataForSEO is the single source of truth for now. Re-enable for Cluster Architect later if a gap is found.

### 1M context impact

Heaviest agents (Cluster Architect, SEO Analyst) carry ~1.2K tokens of skill metadata. Compare to the unconstrained "every bundled skill" state (~2.5K). Halving skill overhead does not eliminate the 1M-context risk for genuinely large heartbeats (long competitive reports, large plan documents) but removes the auto-bundle as the trigger.

Enabling usage credits at claude.ai/settings/usage remains the right long-term mitigation for legitimate large-context heartbeats; it is out of scope for this design.

## Routines

Producer agents only — receivers wake automatically on issue assignment.

### Producer routines (13 across 7 agents)

| Agent | Routine | Cron (Europe/Berlin) | Concurrency | Catch-up |
|---|---|---|---|---|
| Keyword Research Specialist | Daily keyword pull | `0 7 * * 1-5` | `coalesce_if_active` | `skip_missed` |
| Keyword Research Specialist | Weekly deep-research | `0 9 * * 3` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| Competitive Intel Analyst | Daily competitor scan | `0 8 * * 1-5` | `coalesce_if_active` | `skip_missed` |
| Competitive Intel Analyst | Weekly competitive landscape | `0 14 * * 5` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| Cluster Architect | Bi-weekly cluster review | `0 10 * * 1,4` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| Content Refresh Specialist | Weekly drift scan | `0 11 * * 1` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| SEO Analyst | Daily ranking pulse | `0 8 * * 1-5` | `coalesce_if_active` | `skip_missed` |
| SEO Analyst | Weekly performance report | `0 9 * * 1` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| AI/GEO Citation Monitor | Weekly AI citation scan | `0 10 * * 2,5` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| AI/GEO Citation Monitor | Monthly GEO restructure proposals | `0 11 1 * *` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| SEO Operations Manager | Weekly stand-up | `0 9 * * 1` | `coalesce_if_active` | `enqueue_missed_with_cap` |
| SEO Operations Manager | EOW WIP check | `0 16 * * 5` | `coalesce_if_active` | `skip_missed` |
| SEO Operations Manager | Monthly budget review | `0 9 1 * *` | `coalesce_if_active` | `enqueue_missed_with_cap` |

### Catch-up policy rationale

- `skip_missed` for daily routines: missed yesterday's pull = irrelevant; fresh data tomorrow.
- `enqueue_missed_with_cap` for weekly/monthly synthesis routines: late report still has value; cap of 25 prevents floods after long downtime.

### Receiver agents (no Routines)

| Agent | Wakes on |
|---|---|
| Content Strategist | Cluster Architect mentions or assigns approved cluster plan |
| Content Writer | Strategist or Refresh Specialist assigns brief |
| SEO Engineer | Writer's PR enters `in_review` |
| CEO | Escalations, approval requests |

### Routine API shape

Routines and triggers are created in two calls (per `skills/paperclip/references/routines.md`).

**1. Create the routine** (the title and description become the seed text for every run issue):

```
POST /api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/routines
{
  "title": "Daily keyword pull",
  "description": "Run the daily DataForSEO keyword pull for the active practice areas. Classify by intent, post findings to the keyword-pool issue, mention Cluster Architect on high-value gaps.",
  "assigneeAgentId": "<keyword-researcher-agent-id>",
  "projectId": "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  "priority": "medium",
  "status": "active",
  "concurrencyPolicy": "coalesce_if_active",
  "catchUpPolicy": "skip_missed"
}
```

**2. Add the schedule trigger:**

```
POST /api/routines/{routineId}/triggers
{
  "kind": "schedule",
  "cronExpression": "0 7 * * 1-5",
  "timezone": "Europe/Berlin"
}
```

Agents can create their own routines (Paperclip restricts `assigneeAgentId` to the caller); board operators can create on behalf of any agent.

## Cross-agent wakes (event-driven, no Routines)

Wired via Paperclip's mention/assignment mechanism:

- Keyword Researcher posts findings → mentions Cluster Architect when a high-value gap exists
- Competitive Intel flags high-impact competitor move → opens issue assigned to Cluster Architect
- SEO Analyst's weekly report → creates CTR-fix issues assigned to Writer, decay issues assigned to Refresh Specialist
- AI/GEO Monitor finds citation gap → opens issue for Cluster Architect + Strategist

## Approval gates

Three pause-for-review checkpoints. Everything else flows automatically.

1. **New cluster proposal** — Cluster Architect → CEO `request_board_approval` before Strategist starts briefing. Stops runaway expansion.
2. **Refresh briefs for high-traffic pages** — Refresh Specialist → Content Strategist review for any page with >X impressions/day. Don't risk demoting a winner. (X = 100/day; tunable.)
3. **GEO restructure proposals** — AI/GEO Monitor → Content Strategist review for any restructure that materially changes a page's anchor answer.

The existing Writer-to-Engineer `in_review` gate stays in place.

## Budget guardrails

### DataForSEO per-routine spend caps

| Routine | Cap (USD) |
|---|---|
| Keyword Researcher daily pull | 0.50 |
| Keyword Researcher weekly deep-research | 3.00 |
| Competitive Intel daily scan | 1.00 |
| Competitive Intel weekly landscape | 2.00 |
| Cluster Architect bi-weekly review | 3.00 |
| Content Refresh weekly drift scan | 1.00 |
| SEO Analyst daily ranking pulse | 0.50 |
| SEO Analyst weekly performance report | 2.00 |
| AI/GEO Citation Monitor weekly scan | 1.00 |
| AI/GEO Citation Monitor monthly restructure | 2.00 |

All routines pass `--max-spend-usd` to the DataForSEO helper.

### Estimated total

~$60/month at full schedule (excluding ad-hoc usage by agents reacting to issues).

### Claude token budget

SEO Operations Manager's monthly budget review pulls per-agent spend, posts a report, and escalates to CEO at 80% of the per-agent monthly budget.

## Rollout plan

Four phases. Each phase delivers value standalone — you can pause between any of them.

### Phase 1 — Skill scope on existing agents (immediate)

Goal: stop the 1M-context bleeding before adding more agents.

- Sync explicit skill lists on CEO, Content Strategist, Content Writer, SEO Engineer, SEO Analyst per the matrix above.
- Verify next heartbeat for each lands a working context.
- No new agents yet.

### Phase 2 — Hire SEO Operations Manager + Cluster Architect

Goal: add the upstream + coordination layer.

- Create both agents via `paperclip-create-agent` workflow.
- Write `AGENTS.md` instructions for each (Cluster Architect mirrors Content Strategist but at strategy level; SEO Ops Manager modeled on a generic coordinator).
- Sync skill lists.
- Configure Cluster Architect's bi-weekly cluster review Routine.
- Configure SEO Operations Manager's weekly stand-up + EOW WIP + monthly budget Routines.
- Strategist's `AGENTS.md` is updated to narrow scope (tactical briefs only).

### Phase 3 — Hire Keyword Researcher + Competitive Intel Analyst

Goal: add research depth feeding the Architect.

- Create both agents.
- Write `AGENTS.md` for each.
- Sync skill lists.
- Configure daily + weekly Routines for each.
- Wire mention-based wakes to Cluster Architect.

### Phase 4 — Hire Content Refresh Specialist + AI/GEO Citation Monitor

Goal: add measurement-driven maintenance.

- Create both agents.
- Write `AGENTS.md` for each.
- Sync skill lists.
- Configure weekly Routines for Refresh Specialist; weekly + monthly for AI/GEO Monitor.
- Update SEO Analyst's `AGENTS.md` to route CTR-fix issues to Writer and decay issues to Refresh Specialist.

## Success metrics

After 90 days of full operation:

- **Cluster coverage**: ≥5 practice areas with a pillar page + 5 spoke pages each (up from current ad-hoc state).
- **Topical authority signal**: ≥40% of monitored cluster queries ranking on page 1 (pos 1-10), up from baseline.
- **AI citation rate**: ≥20% of monitored cluster anchor questions cite compound.law in at least one of ChatGPT, Perplexity, Google AI Overviews.
- **Velocity**: ≥4 new pages shipped per week (EN+DE pairs).
- **Refresh cadence**: 100% of pages with declining rank position get a refresh brief within 2 weeks of detection.
- **Budget discipline**: monthly DataForSEO spend ≤$80 (33% headroom above ~$60 estimate).

## Out of scope

- Backlink prospecting / outreach (lives in GTM company).
- Per-practice-area cluster owners (we chose stage-pipeline depth instead).
- Multilingual expansion beyond EN/DE.
- Programmatic SEO at scale (Cluster Architect has the skill available but no dedicated agent yet; revisit if pSEO becomes a priority).
- Backlink-to-page attribution (would need a separate Backlink Prospecting Analyst per design option C).

## Open questions

- **Approval mechanism for cluster proposals**: should the CEO approve every new cluster, or only major ones? Tunable threshold needed (e.g., approve only clusters projected at >X monthly impressions).
- **Routine timezone**: Europe/Berlin assumed throughout. Confirm before implementation.
- **High-traffic threshold for refresh approval gate**: ">100 impressions/day" is a placeholder; needs SEO Analyst input on the actual distribution of compound.law page traffic.
- **Claude usage credits at claude.ai/settings/usage**: enabling these is the right long-term fix for 1M-context legitimate overruns. Out of scope for this design but blocks running the team at full cadence if not enabled.

## References

- Skill bundle vendored at `skills/dataforseo-claude/` (commit `c663be6c`).
- Existing DataForSEO skill at `skills/dataforseo-seo-intelligence/`.
- Existing agent instructions at `/paperclip/instances/default/companies/1c37c7d0…/agents/<agent-id>/instructions/AGENTS.md`.
- Paperclip Routines reference at `skills/paperclip/references/routines.md`.
- Compound Engineering SEO Automation rollout plan: `doc/plans/2026-05-20-dataforseo-seo-automation.md`.
