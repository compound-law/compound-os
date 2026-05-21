---
name: dataforseo-seo-intelligence
description: >
  Use DataForSEO from Paperclip SEO/GEO agents for cost-gated keyword,
  SERP, AI Mode, OnPage, and competitor intelligence. Use when an agent needs
  external SEO evidence for Compound Law, wants to create a baseline, or needs
  to convert DataForSEO output into scoped Paperclip work.
---

# DataForSEO SEO Intelligence

Use this skill when the work needs paid DataForSEO evidence. It is designed for
Compound Engineering's SEO Automation project and for SEO agents that already
have GitHub/GSC context.

## Credentials

Read DataForSEO settings only from environment variables:

- `DATAFORSEO_LOGIN`: plain env value is fine for Compound; use `mohit@compound.law`.
- `DATAFORSEO_PASSWORD`: secret reference only.
- Optional defaults: `DATAFORSEO_DEFAULT_LOCATION_CODE`, `DATAFORSEO_DEFAULT_LANGUAGE_CODE`

Never paste the password into issue text, plans, logs, command examples, or JSON
artifacts. Bind `DATAFORSEO_PASSWORD` as a Paperclip secret to the SEO agents
that need this skill.

## First Run

From the Compound project workspace, run the helper directly:

```bash
node scripts/dataforseo-seo-intelligence.mjs --mode baseline --domain compound.law --keywords "ai legal counsel,gdpr ai procurement,enterprise ai legal risk" --dry-run --max-spend-usd 1
```

From the Paperclip repo, the same helper is exposed as:

```bash
pnpm seo:dataforseo -- --mode baseline --domain compound.law --keywords-file tmp/seo-keywords.txt --include-serp --live --max-spend-usd 2 --output tmp/dataforseo-baseline.json
```

Run the extensive growth preset:

```bash
node scripts/dataforseo-seo-intelligence.mjs --mode baseline --preset growth --domain compound.law --keywords-file tmp/seo-keywords.txt --estimated-pages 250 --labs-item-limit 25 --live --max-spend-usd 10 --output tmp/dataforseo-growth.json
```

## Operating Rules

- Always set `--max-spend-usd`.
- Default daily agent cap: `$10`.
- Default weekly technical crawl cap: `$25`.
- Ask for human approval before any single run above `$25` or any monthly plan above `$100`.
- Prefer `--mode estimate` or `--dry-run` before any new endpoint or keyword batch.
- Pair DataForSEO output with GSC. DataForSEO shows market visibility; GSC remains the source of truth for owned-site impressions, clicks, and page performance.
- Attach or summarize the output JSON in the relevant Paperclip issue or `plan` document.
- Create follow-up issues only when the output contains a quantified opportunity, a named page/keyword, and a clear owner.
- Do not create more new SEO implementation tasks while many existing SEO issues are `in_review`; turn evidence into review guidance or grouped cleanup instead.

## Agent Workflow

SEO Analyst:

- Daily: run `--preset visibility` for priority keywords and AI Mode prompts.
- Weekly: run `--include-ranked-keywords --include-competitors` for `compound.law` and compare against GSC.
- Output: visibility report, rank gaps, AI citation gaps, and competitor domains.

Content Strategist:

- Daily: run `--preset content` for seed topics from GSC, sales calls, and competitor SERPs.
- Use `labsRows` to cluster topics by intent and search volume.
- Output: content briefs for Content Writer with keyword, SERP competitors, page angle, and verification metric.

SEO Engineer:

- Daily: check latest OnPage ready tasks with `--check-on-page-ready`.
- Weekly: run `--preset technical --include-on-page --estimated-pages 500 --on-page-rendering js --live --max-spend-usd 25`.
- After a crawl completes: run `--on-page-task-id <task-id> --live --max-spend-usd 1`.
- Output: grouped technical fix issues for indexability, metadata, canonicals, schema, links, status codes, and rendering/CWV signals.

Content Writer:

- Do not spend DataForSEO budget directly by default.
- Use briefs produced by Content Strategist and evidence artifacts from SEO Analyst.

## Output Interpretation

The command writes a JSON artifact containing:

- `costEstimate`: endpoint-level spend estimate and total projected cost.
- `plannedRequests`: exact API calls/tasks that would run or did run.
- `liveResults`: normalized SERP rows for supported live requests.
- `serpRows`: organic and AI visibility rows.
- `labsRows`: keyword ideas, suggestions, ranked keywords, and competitor rows.
- `onPageRows`: page-level technical SEO rows when retrieving completed crawl data.
- `rawTasks`: DataForSEO task IDs, statuses, and raw result envelopes for follow-up polling.
- `paperclipNextActions`: concise guidance for issue updates.

When writing a Paperclip issue from results, include:

- Target keyword or crawl surface.
- Current Compound visibility, if present.
- Top competitor URLs/domains from `liveResults`.
- Proposed page/content/technical action.
- Verification metric and next DataForSEO/GSC check date.

## Current Implementation Scope

The helper supports live execution for Google Organic SERP, Google AI Mode SERP,
DataForSEO Labs keyword ideas/suggestions/ranked keywords/domain competitors,
OnPage task creation, OnPage tasks-ready checks, and OnPage pages retrieval.
It plans keyword batches but sends live SERP requests one task per API call,
matching DataForSEO's live endpoint limits.
