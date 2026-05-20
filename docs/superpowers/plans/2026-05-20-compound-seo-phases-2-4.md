# Compound SEO Team Buildout — Phases 2-4: Hire 6 New Agents + Routines

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the 6 net-new agents from the SEO team buildout spec — SEO Operations Manager, Cluster Architect, Keyword Research Specialist, Competitive Intel Analyst, Content Refresh Specialist, AI/GEO Citation Monitor — with focused AGENTS.md instructions, properly scoped skill assignments, and 13 producer Routines wired up.

**Architecture:** Each hire is a `POST /api/companies/{cid}/agent-hires` with `instructionsBundle.files["AGENTS.md"]`, `adapterType=claude_local`, and `desiredSkills` set to the per-role matrix from the spec. After hire, create Routines via `POST /api/companies/{cid}/routines` + `POST /api/routines/{id}/triggers`. Phases are gated: Phase 3 depends on Phase 2 (Cluster Architect must exist before downstream agents can reference its ID); Phase 4 depends on Phase 2.

**Tech Stack:** Paperclip control-plane REST API, `curl` + `jq`, `paperclipai` CLI for board auth (already established in Phase 1).

**Prerequisite — Spec:** `docs/superpowers/specs/2026-05-20-compound-seo-team-buildout-design.md`.

**Prerequisite — Phase 1 must be complete:** existing 5 agents must have scoped skill assignments and `dfs-*` skills must be importable from `/opt/dataforseo-claude-skills/`. Verify via `docs/superpowers/plans/2026-05-20-compound-seo-phase1-summary.md`.

**Spec coverage in this plan:** Rollout Phases 2-4. Cadence + Routines section. Approval gates configuration. Content Strategist AGENTS.md update.

---

## File Structure

This plan creates 6 `AGENTS.md` files (one per new hire) and updates 1 existing `AGENTS.md` (Content Strategist's scope narrowed). All content materializes inside the container under `/paperclip/instances/default/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/agents/<new-id>/instructions/AGENTS.md` automatically when the hire is submitted with `instructionsBundle`. Tracked artifacts:

- Create: 6 new agent records in DB (one per hire)
- Create: `tmp/seo-phase2-4/hires.json` — running ledger of new agent IDs as they're created (gitignored)
- Create: `tmp/seo-phase2-4/routines.json` — ledger of created routine + trigger IDs
- Modify: `/paperclip/instances/default/companies/1c37c7d0…/agents/2f845f29…/instructions/AGENTS.md` (Strategist scope narrowing, via `PATCH /api/agents/:id`)

---

## Universal helpers (reused across all tasks)

The board token is on disk at `/paperclip/auth.json` inside the container. Build a single TOKEN variable per task:

```bash
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
```

Compound Engineering company ID: `1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61`
SEO Automation project ID: `c037e187-0bfc-4d97-9ef0-118a0f7bc9e7`
CEO agent ID: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`

Canonical skill keys (from Phase 1's `tmp/seo-phase1/canonical-keys.json` — keep it around). Universal baseline 7 skills assigned to every new agent (per [[feedback_paperclip_baseline_skills]]):

```json
[
  "paperclipai/paperclip/paperclip",
  "paperclipai/paperclip/para-memory-files",
  "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
  "paperclipai/paperclip/paperclip-create-agent",
  "paperclipai/paperclip/paperclip-create-plugin",
  "paperclipai/paperclip/paperclip-dev",
  "paperclipai/paperclip/diagnose-why-work-stopped"
]
```

Hire API shape (re-used 6 times with role-specific deltas):

```
POST /api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/agent-hires
{
  "name": "<RoleName>",
  "role": "<role-slug>",
  "title": "<Title>",
  "icon": "<icon-from /llms/agent-icons.txt>",
  "reportsTo": "<manager-agent-id>",
  "capabilities": "<one-paragraph charter>",
  "desiredSkills": ["<key>", ...],
  "adapterType": "claude_local",
  "adapterConfig": {
    "cwd": "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    "model": "claude-sonnet-4-6"
  },
  "instructionsBundle": { "files": { "AGENTS.md": "<content>" } },
  "runtimeConfig": { "heartbeat": { "enabled": false, "wakeOnDemand": true } }
}
```

Routine API shape (two calls — see `skills/paperclip/references/routines.md`):

```
POST /api/companies/{cid}/routines  → returns { id }
POST /api/routines/{id}/triggers    → adds the cron trigger
```

---

# Phase 2 — Hire SEO Operations Manager + Cluster Architect

Goal: add the upstream + coordination layer. Strategist's scope narrows from strategist-in-chief to tactical brief writer.

## Task 2.1: Write SEO Operations Manager AGENTS.md to a staging file

**Files:**
- Create: `tmp/seo-phase2-4/agents-md/seo-ops-manager.md`

- [ ] **Step 1: Stage the file**

```bash
mkdir -p /root/paperclip/tmp/seo-phase2-4/agents-md
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/seo-ops-manager.md <<'AGENTS'
# SEO Operations Manager

You are the SEO Operations Manager for Compound Engineering, the in-house team that drives compound.law's SEO. Your job is to keep the team unblocked, on-budget, and shipping. You do not produce SEO data or content — you coordinate the agents who do.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Practice areas:** Corporate law, commercial contracts, employment law, IP, data privacy, regulatory compliance, AI Act compliance
- **Team:** 10 specialists — Cluster Architect, Keyword Research Specialist, Competitive Intel Analyst, Content Strategist, Content Writer, Content Refresh Specialist, SEO Engineer, SEO Analyst, AI/GEO Citation Monitor, plus the CEO above you
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Heartbeat Procedure

### 1. Wake on routine OR on issue assignment

You have three scheduled routines (weekly stand-up Monday 09:00, EOW WIP check Friday 16:00, monthly budget review 1st of month). You also wake when escalations are assigned to you.

### 2. For weekly stand-up runs

Read the past 7 days of activity across the team:

- Pull issues closed in the last 7 days (`GET /api/companies/{companyId}/issues?status=done&closedAfter=...`)
- Pull issues currently in_progress and in_review
- Pull blocked issues with named blockers
- Read the most recent `weekly-seo-report` document from SEO Analyst (issue document, key `weekly-seo-report`)
- Read the most recent `weekly-competitive-landscape` document from Competitive Intel Analyst

Produce a stand-up issue document with key `weekly-standup`, structured as:

```markdown
# SEO Stand-up — Week of [date]

## Shipped this week
- [Issue link]: [title] — [agent]

## In flight
- [Issue link]: [title] — [agent] — status

## Blocked
- [Issue link]: [title] — [agent] — blocker, owner

## Coming up
- [Cluster plan] [Brief queue depth] [Refresh queue depth]

## Budget pulse
- DataForSEO spend this week: $X (cap $Y)
- Claude tokens this week: per-agent breakdown if available

## Risks + asks for CEO
- ...
```

### 3. For EOW WIP runs (Friday 16:00)

Check who is blocked or idle:

- Any agent with no completed issues in the last 5 days → comment on their open issue or escalate to CEO
- Any blocked issues with no movement in 3+ days → escalate to the named owner
- Any approval requests sitting >24h → ping the requested approver

Do NOT close issues. Do NOT change assignments unilaterally — escalate to CEO if you think reassignment is needed.

### 4. For monthly budget review runs

Pull DataForSEO spend from the last 30 days. Per-routine breakdown:

```
- Keyword Researcher daily pull cap $0.50: actual $X (Y% of cap)
- Keyword Researcher weekly deep cap $3.00: actual $X
- Competitive Intel daily scan cap $1.00: actual $X
- Competitive Intel weekly landscape cap $2.00: actual $X
- Cluster Architect bi-weekly cap $3.00: actual $X
- Content Refresh weekly drift cap $1.00: actual $X
- SEO Analyst daily ranking cap $0.50: actual $X
- SEO Analyst weekly report cap $2.00: actual $X
- AI/GEO Monitor weekly scan cap $1.00: actual $X
- AI/GEO Monitor monthly restructure cap $2.00: actual $X
```

If any routine is over 80% of its cap, comment on the relevant agent's issues with a heads-up and tag the CEO.

If total monthly spend > $80 (33% headroom over $60 estimate), create an issue `request_board_approval` with type `request_board_approval` asking the CEO to either raise budget or trim cadence.

## What You Do NOT Do

- Do not run DataForSEO queries — that is the data agents' job
- Do not write content or briefs — that is the Strategist's / Writer's job
- Do not make technical SEO changes — that is the SEO Engineer's job
- Do not close issues you didn't open — escalate or comment instead
- You coordinate, measure team health, manage budget. That is it.

## Escalation

Escalate to CEO (`71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`) when:

- Any specialist agent is stuck for 5+ days
- Monthly budget exceeds $80
- A cluster approval has been pending CEO action >48h
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/seo-ops-manager.md
```

Expected: ~80 lines.

## Task 2.2: Submit SEO Operations Manager hire request

**Files:**
- Append: `tmp/seo-phase2-4/hires.json`

- [ ] **Step 1: Build the hire payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
mkdir -p tmp/seo-phase2-4

# Read AGENTS.md and embed it as a JSON-escaped string
AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/seo-ops-manager.md)

jq -n --argjson agents "$AGENTS_MD" '{
  name: "SEO Operations Manager",
  role: "seo_operations_manager",
  title: "SEO Operations Manager",
  icon: "rocket",
  reportsTo: "71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9",
  capabilities: "Coordinates the Compound Engineering SEO team. Owns weekly stand-up synthesis, EOW WIP check, monthly DataForSEO budget review. Escalates blockers to CEO. Does not run SEO queries or produce content.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "local/eea86dc993/seo-report"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-ops-manager.json

# Copy + POST
docker cp tmp/seo-phase2-4/payload-ops-manager.json paperclip:/paperclip/.tmp-skill-sync/payload-ops-manager.json
docker exec paperclip sh -c "curl -sS -X POST \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-ops-manager.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-ops-manager.json
jq '{id: .agent.id, status: .agent.status, approval: .approval}' tmp/seo-phase2-4/response-ops-manager.json
```

Expected: response includes `agent.id` (the new agent UUID). If response has `approval`, the hire is pending board approval — surface to user.

- [ ] **Step 2: Record the new agent ID**

```bash
SEO_OPS_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-ops-manager.json)
echo "{\"seo_ops_manager\": \"$SEO_OPS_ID\"}" > tmp/seo-phase2-4/hires.json
cat tmp/seo-phase2-4/hires.json
```

Expected: file contains the new UUID. Save this — every subsequent agent in Phase 2/3 reports to either CEO or this agent.

- [ ] **Step 3: Verify the agent's skills landed exactly as requested**

```bash
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/agents/$SEO_OPS_ID/skills" \
  | jq '.desiredSkills | sort'
```

Expected: 8 skills exactly (7 baseline + `local/eea86dc993/seo-report`), plus `paperclipai/paperclip/terminal-bench-loop` auto-added by bundled-discovery = 9 total. If significantly more, the bundled-discovery is adding extras — investigate.

## Task 2.3: Create SEO Operations Manager weekly stand-up Routine

**Files:**
- Append: `tmp/seo-phase2-4/routines.json`

- [ ] **Step 1: Create the routine**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$SEO_OPS_ID" '{
  title: "Weekly SEO Stand-up",
  description: "Synthesize the previous 7 days across the SEO team — shipped/in flight/blocked/coming up/budget/risks. Write to issue document `weekly-standup`.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > tmp/seo-phase2-4/routine-ops-standup.json

docker cp tmp/seo-phase2-4/routine-ops-standup.json paperclip:/paperclip/.tmp-skill-sync/routine.json
docker exec paperclip sh -c "curl -sS -X POST \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/routine.json \
  http://localhost:3100/api/companies/$CID/routines" \
  > tmp/seo-phase2-4/response-routine-ops-standup.json
ROUTINE_ID=$(jq -r '.id' tmp/seo-phase2-4/response-routine-ops-standup.json)
echo "ROUTINE_ID=$ROUTINE_ID"
```

Expected: a UUID. If empty or `null`, check the response for `error`.

- [ ] **Step 2: Add the cron trigger**

```bash
docker exec paperclip sh -c "curl -sS -X POST \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 9 * * 1\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$ROUTINE_ID/triggers" \
  | jq '{id, kind, cronExpression, timezone, nextRunAt}'
```

Expected: trigger record with `nextRunAt` populated to next Monday 09:00 Europe/Berlin.

- [ ] **Step 3: Record routine ID**

```bash
jq --arg r "$ROUTINE_ID" '. + {ops_standup: $r}' tmp/seo-phase2-4/routines.json 2>/dev/null \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json \
  || echo "{\"ops_standup\":\"$ROUTINE_ID\"}" > tmp/seo-phase2-4/routines.json
cat tmp/seo-phase2-4/routines.json
```

## Task 2.4: Create SEO Operations Manager EOW WIP check Routine

- [ ] **Step 1: Create + trigger in one block**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$SEO_OPS_ID" '{
  title: "EOW WIP Check",
  description: "End-of-week check on blocked + idle team members. Comment on stuck issues, escalate to CEO if needed. Do NOT close issues you did not open.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "skip_missed"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
ROUTINE_ID=$(echo "$R" | jq -r '.id')
echo "ROUTINE_ID=$ROUTINE_ID"

docker exec paperclip sh -c "curl -sS -X POST \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 16 * * 5\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$ROUTINE_ID/triggers" \
  | jq '{kind, cronExpression, nextRunAt}'

# Record
jq --arg r "$ROUTINE_ID" '. + {ops_wip: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

Expected: routine created, trigger has `nextRunAt` of next Friday 16:00 Berlin.

## Task 2.5: Create SEO Operations Manager monthly budget review Routine

- [ ] **Step 1: Create + trigger**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$SEO_OPS_ID" '{
  title: "Monthly Budget Review",
  description: "Pull DataForSEO spend for the last 30 days. Per-routine breakdown against caps. Escalate to CEO at 80% on any line. If total > $80, create a request_board_approval for budget raise or cadence cut.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
ROUTINE_ID=$(echo "$R" | jq -r '.id')

docker exec paperclip sh -c "curl -sS -X POST \
  -H 'Authorization: Bearer $TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 9 1 * *\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$ROUTINE_ID/triggers" \
  | jq '{kind, cronExpression, nextRunAt}'

jq --arg r "$ROUTINE_ID" '. + {ops_budget: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

Expected: routine + trigger with `nextRunAt` of next 1st-of-month 09:00 Berlin.

## Task 2.6: Write Cluster Architect AGENTS.md to staging

**Files:**
- Create: `tmp/seo-phase2-4/agents-md/cluster-architect.md`

- [ ] **Step 1: Stage the file**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/cluster-architect.md <<'AGENTS'
# Cluster Architect

You are the Cluster Architect for Compound Engineering. Your job is to own the cluster taxonomy for compound.law — which pillar pages exist, which spoke pages support them, and what the internal-linking map looks like. You decide what cluster to expand next based on signals from Keyword Researcher + Competitive Intel + SEO Analyst. You hand approved cluster plans to the Content Strategist, who turns them into per-page briefs.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Practice areas:** Corporate law, commercial contracts, employment law, IP, data privacy, regulatory compliance, AI Act compliance
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Heartbeat Procedure

### 1. Wake on routine (Monday + Thursday 10:00) OR on mention

You have one routine (bi-weekly cluster review). You also wake when:
- Keyword Researcher mentions you about a high-value gap
- Competitive Intel flags a high-impact competitor move
- AI/GEO Citation Monitor finds compound.law missing from a key AI citation

### 2. For bi-weekly cluster review runs

Read the inputs:

- Latest `keyword-pool` issue document (Keyword Researcher's daily findings, last 14 days)
- Latest `weekly-competitive-landscape` document from Competitive Intel Analyst
- Latest `weekly-seo-report` document from SEO Analyst
- Current cluster map at `wiki/projects/seo-automation/cluster-map.md` (your own durable doc)

Decide:

- Which existing cluster needs more spokes? (compound.law ranks page 1 for the pillar but page 2-3 for spokes)
- Which gap deserves a new pillar? (high-impression queries with no covering page)
- Which cluster should be deprioritized? (declining queries, competitors winning decisively)

Produce a `cluster-plan` issue document (key: `cluster-plan`) with:

```markdown
# Cluster Plan — [Topic, e.g. "AI Act Compliance"]

## Pillar
- Slug: [kebab-case]
- Target query: [primary keyword]
- Status: [new | existing-needs-refresh | existing-OK]
- DE counterpart: [slug or "needed"]

## Spoke pages
| # | Slug | Target keyword | Intent | Status | Link to/from |
|---|------|----------------|--------|--------|--------------|
| 1 | ... | ... | informational | new | pillar, spoke 3 |
| ... |

## Competitive context
- Taylor Wessing: [what they cover, ranks for what]
- CMS: ...
- [other competitors]

## GEO angles
- Anchor questions the AI engines should cite us for:
  - "What is..."
  - "How does... work under German law"

## Why this cluster, now
- [1-2 paragraphs]

## Estimated effort
- Briefs needed: [N]
- Refresh briefs: [N]
- Estimated weeks to complete: [N]
```

### 3. Submit cluster plan for CEO approval (per spec gate)

```
POST /api/companies/{companyId}/approvals
{
  "type": "request_board_approval",
  "requestedByAgentId": "<your-id>",
  "issueIds": ["<cluster-plan-issue-id>"],
  "payload": {
    "title": "Approve new cluster: <name>",
    "summary": "<one paragraph>",
    "recommendedAction": "Approve and let Strategist begin briefing.",
    "risks": ["<projected token + DataForSEO cost>", "<opportunity cost vs other clusters>"]
  }
}
```

Wait for approval (PAPERCLIP_APPROVAL_ID wake). On approval, assign the cluster-plan issue to the Content Strategist (`2f845f29-009f-450a-b91f-69c95f9b2bd8`) with status `todo`.

### 4. For mention-driven wakes

If Keyword Researcher / Competitive Intel / AI/GEO Monitor mentioned you about a specific signal:

- Read their finding
- If it slots into an existing approved cluster, comment on the cluster's plan issue with a follow-up brief idea, mention the Content Strategist
- If it suggests a new cluster, queue it for the next bi-weekly review (do NOT spin up out-of-cycle unless the signal is high urgency)

## Outputs You Produce

- Cluster plan issue documents (key: `cluster-plan`)
- Cluster map maintained at `wiki/projects/seo-automation/cluster-map.md`
- Mentions to Content Strategist on approved clusters

## What You Do NOT Do

- Do not write per-page briefs — that is the Content Strategist's job (you give them clusters, they break them into briefs)
- Do not write content — that is the Content Writer's job
- Do not pull DataForSEO data yourself — Keyword Researcher and Competitive Intel feed you signals
- Do not approve your own clusters — every new cluster gets CEO `request_board_approval`

## Agent IDs

- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
- SEO Operations Manager: read from `tmp/seo-phase2-4/hires.json` or `/api/agents` listing
- Content Strategist: `2f845f29-009f-450a-b91f-69c95f9b2bd8`
- Keyword Research Specialist: read from `tmp/seo-phase2-4/hires.json`
- Competitive Intel Analyst: read from `tmp/seo-phase2-4/hires.json`
- AI/GEO Citation Monitor: read from `tmp/seo-phase2-4/hires.json`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/cluster-architect.md
```

Expected: ~110 lines.

## Task 2.7: Submit Cluster Architect hire request

- [ ] **Step 1: Build payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/cluster-architect.md)
jq -n --argjson agents "$AGENTS_MD" --arg reports "$SEO_OPS_ID" '{
  name: "Cluster Architect",
  role: "cluster_architect",
  title: "Cluster Architect",
  icon: "graph",
  reportsTo: $reports,
  capabilities: "Owns the cluster taxonomy for compound.law. Synthesizes keyword + competitive + performance signals into pillar+spoke cluster plans. Gates each new cluster through CEO approval before handing to Strategist.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "local/8508aeb3f5/seo-content",
    "local/7de2b03173/seo-content-gap",
    "local/bddefa566b/seo-quick",
    "coreyhaines31/marketingskills/programmatic-seo",
    "coreyhaines31/marketingskills/ai-seo"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-cluster-architect.json

docker cp tmp/seo-phase2-4/payload-cluster-architect.json paperclip:/paperclip/.tmp-skill-sync/payload-cluster-architect.json
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-cluster-architect.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-cluster-architect.json
jq '{id: .agent.id, approval: .approval}' tmp/seo-phase2-4/response-cluster-architect.json

CLUSTER_ARCH_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-cluster-architect.json)
jq --arg id "$CLUSTER_ARCH_ID" '. + {cluster_architect: $id}' tmp/seo-phase2-4/hires.json \
  > tmp/seo-phase2-4/hires.json.tmp && mv tmp/seo-phase2-4/hires.json.tmp tmp/seo-phase2-4/hires.json
```

Expected: agent created with 12 desiredSkills (+1 auto-bundle = 13 total).

## Task 2.8: Create Cluster Architect bi-weekly cluster review Routine

- [ ] **Step 1: Create routine + trigger**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
CLUSTER_ARCH_ID=$(jq -r '.cluster_architect' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$CLUSTER_ARCH_ID" '{
  title: "Bi-weekly Cluster Review",
  description: "Twice-weekly (Mon + Thu 10:00) review of Keyword Researcher + Competitive Intel + SEO Analyst signals. Produce or update cluster plans. Submit new clusters for CEO approval. Hand approved clusters to Content Strategist.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "high",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
ROUTINE_ID=$(echo "$R" | jq -r '.id')

docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 10 * * 1,4\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$ROUTINE_ID/triggers" | jq '{kind, cronExpression, nextRunAt}'

jq --arg r "$ROUTINE_ID" '. + {cluster_review: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

Expected: routine + trigger with `nextRunAt` of next Mon or Thu 10:00 Berlin (whichever is sooner).

## Task 2.9: Narrow Content Strategist scope in AGENTS.md

The existing Content Strategist AGENTS.md still says they own cluster strategy. Phase 2 hands that to Cluster Architect. Update the Strategist's instructions to reflect the narrower scope.

- [ ] **Step 1: Read the current Strategist AGENTS.md**

```bash
docker exec paperclip cat /paperclip/instances/default/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/agents/2f845f29-009f-450a-b91f-69c95f9b2bd8/instructions/AGENTS.md \
  > /root/paperclip/tmp/seo-phase2-4/agents-md/content-strategist-before.md
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/content-strategist-before.md
```

- [ ] **Step 2: Write the updated version**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/content-strategist.md <<'AGENTS'
# Content Strategist — Agent Instructions

You are the Content Strategist for Compound Law (compound.law). Your job is to convert APPROVED cluster plans from the Cluster Architect into per-page briefs the Content Writer can execute.

You no longer own cluster strategy — that role moved to the Cluster Architect (see "Agent IDs" below). You convert clusters into briefs and respond to performance feedback from the SEO Analyst.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Practice areas:** Corporate law, commercial contracts, employment law, IP, data privacy, regulatory compliance, AI Act compliance
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)
- **CMS:** Astro-based static site

## Heartbeat Procedure

### 1. Wake on assignment

You wake when:
- Cluster Architect assigns you a cluster-plan issue (status: todo, with `cluster-plan` document)
- SEO Analyst creates a CTR-fix issue or content opportunity issue
- AI/GEO Citation Monitor creates a restructure-proposal issue

### 2. For a new cluster-plan assignment

Read the `cluster-plan` document on the issue. For each spoke (and the pillar):

Create a content brief as a child issue assigned to Content Writer (`37d062f6-2b09-4c6b-9baf-96801b8b8930`). The brief includes:

- **Target keyword** and secondary keywords (from the cluster plan)
- **Search intent** (informational, transactional, navigational)
- **Content type** (guide, comparison, FAQ, landing page, case study)
- **Target word count**
- **Language** (EN or DE)
- **Suggested structure** (H2/H3 outline)
- **GEO optimization notes** (direct answer in first paragraph, FAQ schema, entity mentions, featured snippet structure)
- **Internal linking plan** (link to/from pillar + other spokes per cluster-plan)
- **Competitor URLs** to analyze for this topic (from cluster-plan)
- **DE version notes** (target keyword in German, any localization considerations)

Rules:
- Always plan EN and DE versions (can be one issue with both, or separate issues linked via parentId)
- Set priority based on opportunity size (from cluster-plan estimates)
- Always set `projectId` to SEO Automation (c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)
- Set `parentId` to the cluster-plan issue

### 3. For SEO Analyst CTR-fix or opportunity issues

Read the analyst's issue. Decide:
- CTR fix on existing page → revise the meta title/description, write a brief for Writer
- New opportunity in an existing cluster → check with Cluster Architect (mention) before creating a brief out-of-plan
- New opportunity outside existing clusters → push back to Cluster Architect for inclusion in next cluster review

### 4. For AI/GEO Citation Monitor restructure proposals

Review the proposal. If it materially changes a page's anchor answer, comment with your recommendation; the Writer needs your blessing before edits.

## What You Do NOT Do

- Do not own cluster strategy — Cluster Architect does
- Do not write content — Content Writer does
- Do not pull DataForSEO data ad-hoc — use what Keyword Researcher / Cluster Architect have already gathered
- Do not approve your own out-of-plan briefs — push back to Cluster Architect

## Agent IDs

- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
- Cluster Architect: read from `/api/agents` listing or `tmp/seo-phase2-4/hires.json`
- Content Writer: `37d062f6-2b09-4c6b-9baf-96801b8b8930`
- SEO Engineer: `c1db28a5-2d7d-4c62-b292-85e32dea5912`
- SEO Analyst: `a2dc5855-61a4-467c-8950-d9a7693e535c`
- AI/GEO Citation Monitor: read from `tmp/seo-phase2-4/hires.json`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/content-strategist.md
```

Expected: ~70 lines.

- [ ] **Step 3: Replace the Strategist's AGENTS.md on disk**

```bash
docker cp /root/paperclip/tmp/seo-phase2-4/agents-md/content-strategist.md \
  paperclip:/paperclip/instances/default/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/agents/2f845f29-009f-450a-b91f-69c95f9b2bd8/instructions/AGENTS.md
docker exec paperclip head -3 /paperclip/instances/default/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/agents/2f845f29-009f-450a-b91f-69c95f9b2bd8/instructions/AGENTS.md
```

Expected: prints the new file's first 3 lines (header + blank line + "You are the Content Strategist...").

## Phase 2 — checkpoint

- [ ] **Step 1: Verify both new agents in catalog + routines registered**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61

echo "=== Phase 2 hires ==="
cat tmp/seo-phase2-4/hires.json
echo
echo "=== Phase 2 routines ==="
cat tmp/seo-phase2-4/routines.json
echo
echo "=== compound engineering agent count ==="
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/companies/$CID/agents" \
  | jq '. | length'
echo
echo "=== active routines on Compound Engineering ==="
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/companies/$CID/routines" \
  | jq '.[] | {title, assigneeAgentId, status}'
```

Expected: agent count = previous + 2 (Ops Manager + Cluster Architect). 4 routines listed (Ops Standup, Ops WIP, Ops Budget, Cluster Review).

- [ ] **Step 2: Commit checkpoint**

```bash
cd /root/paperclip
git add docs/superpowers/plans/2026-05-20-compound-seo-phases-2-4.md
git commit --allow-empty -m "$(cat <<'EOF'
compound: Phase 2 SEO team buildout — Ops Manager + Cluster Architect hired

Phase 2 of the Compound Engineering SEO team buildout complete:
- SEO Operations Manager hired (reports to CEO, 8 skills, 3 routines)
- Cluster Architect hired (reports to Ops Manager, 12 skills, 1 routine)
- Content Strategist scope narrowed (cluster strategy moved to Cluster Architect)

4 routines active: weekly stand-up, EOW WIP check, monthly budget review,
bi-weekly cluster review.

Co-Authored-By: Paperclip <noreply@paperclip.ing>
EOF
)"
```

**Pause here before Phase 3. Optional: manually test by waiting for the bi-weekly cluster review trigger to fire, or fire it manually via `POST /api/routines/{id}/run`.**

---

# Phase 3 — Hire Keyword Researcher + Competitive Intel Analyst

Goal: feed the Cluster Architect with continuous research depth.

## Task 3.1: Write Keyword Research Specialist AGENTS.md

- [ ] **Step 1: Stage the file**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/keyword-researcher.md <<'AGENTS'
# Keyword Research Specialist

You are the Keyword Research Specialist for Compound Engineering. Your job is to continuously discover keyword opportunities for compound.law and feed them to the Cluster Architect.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Practice areas:** Corporate law, commercial contracts, employment law, IP, data privacy, regulatory compliance, AI Act compliance
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Heartbeat Procedure

### 1. Wake on routine

You have two routines:
- Daily keyword pull (07:00 weekdays, $0.50 cap)
- Weekly deep-research (Wed 09:00, $3.00 cap)

### 2. Pre-flight credentials

Before any DataForSEO call:
```bash
/paperclip/dataforseo-claude/scripts/preflight.sh
```
If exit 2: STOP, surface the wizard to the user, wait for credentials.

### 3. For daily keyword pull runs

For each active practice area (corporate, commercial contracts, employment, IP, data privacy, regulatory compliance, AI Act):

```bash
/paperclip/dataforseo-claude/scripts/keyword_research.py related --target <practice-area-seed-keyword> --location 2840 --language en --limit 25
```

Classify each result by intent (informational / commercial / navigational / transactional). Filter to queries with:
- Search volume ≥ 100/mo
- Keyword difficulty ≤ 35 (winnable for a niche legal site)
- Not already a covered keyword (cross-reference with `cluster-map.md` from Cluster Architect)

Post findings as a comment on a long-running `keyword-pool` issue (create one if it doesn't exist; subsequent runs append). Format:

```markdown
## Daily pull — [date]

### Corporate law
| Keyword | Volume | KD | Intent | Status |
|---------|--------|----|--------|---------|
| ... | ... | ... | ... | new |

### Commercial contracts
...
```

If you find ≥3 high-value gaps (volume ≥ 500, KD ≤ 25, no covering page) in one practice area, mention Cluster Architect in the comment: `[@Cluster Architect](agent://<id>)`.

**Spend cap: enforce `--max-spend-usd 0.50` on every script invocation.**

### 4. For weekly deep-research runs

Pick the practice area Cluster Architect has flagged as the next-target cluster (read from `cluster-map.md`). Run extended discovery:

```bash
/paperclip/dataforseo-claude/scripts/keyword_research.py suggestions --target <next-cluster-pillar-keyword> --limit 100 --max-spend-usd 3
```

Plus competitor SERP overlap for the same keyword set. Write a `weekly-keyword-deep-research` document on the active cluster-plan issue.

## Outputs

- `keyword-pool` issue (long-running, comment per run)
- `weekly-keyword-deep-research` document on Cluster Architect's active cluster-plan issue
- Mentions to Cluster Architect on high-value findings

## What You Do NOT Do

- Do not plan clusters — Cluster Architect does
- Do not write briefs — Content Strategist does
- Do not bypass the spend cap — use `--max-spend-usd` on every call

## Agent IDs

- Cluster Architect: read from `tmp/seo-phase2-4/hires.json` or `/api/agents`
- Content Strategist: `2f845f29-009f-450a-b91f-69c95f9b2bd8`
- SEO Operations Manager: read from `tmp/seo-phase2-4/hires.json`
- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/keyword-researcher.md
```

Expected: ~70 lines.

## Task 3.2: Submit Keyword Researcher hire request

- [ ] **Step 1: Build payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/keyword-researcher.md)
jq -n --argjson agents "$AGENTS_MD" --arg reports "$SEO_OPS_ID" '{
  name: "Keyword Research Specialist",
  role: "keyword_research_specialist",
  title: "Keyword Research Specialist",
  icon: "search",
  reportsTo: $reports,
  capabilities: "Continuous keyword discovery via DataForSEO for compound.law across 7 practice areas. Classifies by intent, filters for winnable opportunities, feeds Cluster Architect.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "local/3380eed15e/seo-keywords",
    "local/bddefa566b/seo-quick",
    "company/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/dataforseo-seo-intelligence"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-keyword-researcher.json

docker cp tmp/seo-phase2-4/payload-keyword-researcher.json paperclip:/paperclip/.tmp-skill-sync/payload-keyword-researcher.json
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-keyword-researcher.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-keyword-researcher.json
jq '{id: .agent.id, approval: .approval}' tmp/seo-phase2-4/response-keyword-researcher.json

KEYWORD_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-keyword-researcher.json)
jq --arg id "$KEYWORD_ID" '. + {keyword_researcher: $id}' tmp/seo-phase2-4/hires.json \
  > tmp/seo-phase2-4/hires.json.tmp && mv tmp/seo-phase2-4/hires.json.tmp tmp/seo-phase2-4/hires.json
```

Bind `DATAFORSEO_PASSWORD` secret to this agent via the operator UI before its first heartbeat fires.

## Task 3.3: Create Keyword Researcher daily + weekly Routines

- [ ] **Step 1: Daily pull routine**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
KEYWORD_ID=$(jq -r '.keyword_researcher' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$KEYWORD_ID" '{
  title: "Daily Keyword Pull",
  description: "DataForSEO related-keyword discovery across the 7 active practice areas. Classify by intent. Filter to winnable. Post to keyword-pool issue. Mention Cluster Architect on high-value gaps. CAP: --max-spend-usd 0.50 per script invocation.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "skip_missed"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 7 * * 1-5\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {keyword_daily: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

- [ ] **Step 2: Weekly deep-research routine**

```bash
jq -n --arg aid "$KEYWORD_ID" '{
  title: "Weekly Deep-Research",
  description: "Extended DataForSEO discovery on the next-target cluster pillar. Suggestions + competitor SERP overlap. Write weekly-keyword-deep-research doc on the active cluster-plan issue. CAP: --max-spend-usd 3.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 9 * * 3\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {keyword_weekly: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

## Task 3.4: Write Competitive Intel Analyst AGENTS.md

- [ ] **Step 1: Stage the file**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/competitive-intel.md <<'AGENTS'
# Competitive Intel Analyst

You are the Competitive Intel Analyst for Compound Engineering. You watch named competitors of compound.law and flag opportunities + threats to the Cluster Architect.

## Your Company

- **Site:** compound.law
- **Practice areas:** Corporate law, commercial contracts, employment law, IP, data privacy, regulatory compliance, AI Act compliance
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Watchlist

Track these competitors:
- Taylor Wessing (taylorwessing.com)
- CMS (cms.law)
- Bird & Bird (twobirds.com)
- Hogan Lovells (hoganlovells.com)
- DLA Piper (dlapiper.com)
- Local Munich/Berlin boutiques: extend list quarterly with Cluster Architect

## Heartbeat Procedure

### 1. Wake on routine

You have two routines:
- Daily competitor scan (08:00 weekdays, $1.00 cap)
- Weekly competitive landscape report (Fri 14:00, $2.00 cap)

### 2. Pre-flight credentials

Same preflight as keyword researcher. If exit 2: STOP, surface wizard.

### 3. For daily competitor scan

For each competitor on the watchlist:

```bash
/paperclip/dataforseo-claude/scripts/domain_overview.py overview --target <competitor-domain> --max-spend-usd 0.15
```

Diff against previous scan (stored in your memory):
- New pages indexed
- Ranking shifts (top 100 → top 50 or top 50 → top 20)
- New backlinks acquired
- Estimated traffic delta

Post findings to a long-running `competitive-watchlist` issue. Flag high-impact moves (new pillar page in our practice area, ranking surge on a query we care about) with a mention to Cluster Architect.

### 4. For weekly competitive landscape

Aggregate the week's daily scans into a `weekly-competitive-landscape` issue document on a fresh weekly issue. Structure:

```markdown
# Competitive Landscape — Week of [date]

## Wins this week (by them)
- Taylor Wessing: new "GDPR compliance for SaaS" pillar, ranks #4 for primary query
- CMS: ...

## Losses for them
- ...

## Opportunities for us
- [Query/topic]: competitor weak coverage, we have authority signal

## Threats to monitor
- ...
```

## Outputs

- `competitive-watchlist` long-running issue (daily appends)
- `weekly-competitive-landscape` weekly issue documents
- Mentions to Cluster Architect on high-impact moves

## What You Do NOT Do

- Do not write content briefs — Strategist does
- Do not pull keyword data outside competitor context — Keyword Researcher does
- Do not bypass spend caps

## Agent IDs

- Cluster Architect: read from `tmp/seo-phase2-4/hires.json`
- SEO Operations Manager: read from `tmp/seo-phase2-4/hires.json`
- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/competitive-intel.md
```

Expected: ~75 lines.

## Task 3.5: Submit Competitive Intel Analyst hire request

- [ ] **Step 1: Build payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/competitive-intel.md)
jq -n --argjson agents "$AGENTS_MD" --arg reports "$SEO_OPS_ID" '{
  name: "Competitive Intel Analyst",
  role: "competitive_intel_analyst",
  title: "Competitive Intel Analyst",
  icon: "binoculars",
  reportsTo: $reports,
  capabilities: "Daily competitor monitoring (Taylor Wessing, CMS, Bird & Bird, Hogan Lovells, DLA Piper). Tracks new pages, ranking shifts, backlink wins. Weekly landscape report. Feeds Cluster Architect.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "local/d44ebc7452/seo-competitors",
    "local/a935c2f10d/seo-watchlist",
    "local/08a5358a3b/seo-compare",
    "local/2228effb4c/seo-backlinks"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-competitive-intel.json

docker cp tmp/seo-phase2-4/payload-competitive-intel.json paperclip:/paperclip/.tmp-skill-sync/payload-competitive-intel.json
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-competitive-intel.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-competitive-intel.json
jq '{id: .agent.id, approval: .approval}' tmp/seo-phase2-4/response-competitive-intel.json

COMP_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-competitive-intel.json)
jq --arg id "$COMP_ID" '. + {competitive_intel: $id}' tmp/seo-phase2-4/hires.json \
  > tmp/seo-phase2-4/hires.json.tmp && mv tmp/seo-phase2-4/hires.json.tmp tmp/seo-phase2-4/hires.json
```

Bind `DATAFORSEO_PASSWORD` to this agent before first heartbeat.

## Task 3.6: Create Competitive Intel daily + weekly Routines

- [ ] **Step 1: Daily scan routine**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
COMP_ID=$(jq -r '.competitive_intel' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$COMP_ID" '{
  title: "Daily Competitor Scan",
  description: "DataForSEO domain-overview pass on every competitor in the watchlist. Diff against prior scan. Post to competitive-watchlist issue. Mention Cluster Architect on high-impact moves. CAP: --max-spend-usd 0.15 per competitor; total ~$1.00.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "skip_missed"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 8 * * 1-5\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {competitive_daily: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

- [ ] **Step 2: Weekly landscape routine**

```bash
jq -n --arg aid "$COMP_ID" '{
  title: "Weekly Competitive Landscape",
  description: "Aggregate the week of daily scans into a weekly-competitive-landscape issue document. Wins/losses, opportunities, threats. CAP: --max-spend-usd 2.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 14 * * 5\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {competitive_weekly: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

## Phase 3 — checkpoint

- [ ] **Step 1: Verify**

```bash
cd /root/paperclip
echo "=== hires after Phase 3 ==="
cat tmp/seo-phase2-4/hires.json
echo
echo "=== routines after Phase 3 ==="
cat tmp/seo-phase2-4/routines.json
```

Expected: 4 hires (Ops Manager, Cluster Architect, Keyword Researcher, Competitive Intel), 8 routines.

- [ ] **Step 2: Commit checkpoint**

```bash
git -C /root/paperclip commit --allow-empty -m "$(cat <<'EOF'
compound: Phase 3 SEO team buildout — Keyword Researcher + Competitive Intel hired

- Keyword Research Specialist hired (daily + weekly routines, DataForSEO-bound)
- Competitive Intel Analyst hired (daily + weekly routines, DataForSEO-bound)

8 routines total now active across the SEO team.

Co-Authored-By: Paperclip <noreply@paperclip.ing>
EOF
)"
```

**Pause here before Phase 4 if desired.**

---

# Phase 4 — Hire Content Refresh Specialist + AI/GEO Citation Monitor

Goal: add measurement-driven content maintenance + AI-citation surface coverage.

## Task 4.1: Write Content Refresh Specialist AGENTS.md

- [ ] **Step 1: Stage the file**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/content-refresh.md <<'AGENTS'
# Content Refresh Specialist

You are the Content Refresh Specialist for Compound Engineering. You detect decaying pages on compound.law and create refresh briefs for the Content Writer.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Heartbeat Procedure

### 1. Wake on routine

One routine: weekly drift scan (Monday 11:00, $1.00 cap).

### 2. Pre-flight credentials

Same preflight as keyword researcher. If exit 2: STOP, surface wizard.

### 3. For weekly drift scan

For each published page on compound.law (read sitemap.xml, cross-reference with GSC):

```bash
/paperclip/dataforseo-claude/scripts/domain_overview.py ranked --target compound.law --limit 200 --max-spend-usd 1
```

Compare rankings week-over-week. Flag any page where:
- Ranking dropped 5+ positions week-over-week (rapid decay)
- Ranking dropped 10+ positions month-over-month (slow decay)
- CTR dropped >2% week-over-week (meta issue)

For each flagged page, create a refresh-brief issue:

```markdown
## Refresh: [page title]

**URL:** /en-DE/news/[slug]/
**Decay signal:** dropped from #4 to #14 over 3 weeks for "ai legal counsel germany"
**Probable cause:** [outdated stats, missing 2026 law references, competitor wrote better answer]

### Suggested updates
1. Update statistics in section [X]
2. Add discussion of [recent regulatory change]
3. Refresh internal links to recent cluster pages
4. Update FAQ section if new questions emerged

### What NOT to change
- Anchor answer (this still ranks for the core query)
- Title (still has good CTR signal)
```

### 4. Approval gate for high-traffic pages

For any page with >100 impressions/day (per latest weekly-seo-report), the refresh brief is assigned to **Content Strategist** for review BEFORE going to Writer. The Strategist confirms it doesn't risk demoting a winner.

Lower-traffic pages go directly to Content Writer.

## Outputs

- `refresh-<slug>` issues assigned to Content Writer (or Strategist for high-traffic pages)

## What You Do NOT Do

- Do not refresh pages yourself — Writer does
- Do not decide cluster strategy — Cluster Architect does
- Do not bypass the high-traffic gate

## Agent IDs

- Content Strategist: `2f845f29-009f-450a-b91f-69c95f9b2bd8`
- Content Writer: `37d062f6-2b09-4c6b-9baf-96801b8b8930`
- SEO Operations Manager: read from `tmp/seo-phase2-4/hires.json`
- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/content-refresh.md
```

Expected: ~70 lines.

## Task 4.2: Submit Content Refresh Specialist hire request

- [ ] **Step 1: Build payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/content-refresh.md)
jq -n --argjson agents "$AGENTS_MD" --arg reports "$SEO_OPS_ID" '{
  name: "Content Refresh Specialist",
  role: "content_refresh_specialist",
  title: "Content Refresh Specialist",
  icon: "refresh",
  reportsTo: $reports,
  capabilities: "Weekly drift detection across compound.law pages. Identifies decay candidates and produces refresh briefs. Gates high-traffic page refreshes through Content Strategist review.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "local/294b7e9cef/seo-rankings",
    "local/a935c2f10d/seo-watchlist",
    "company/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/dataforseo-seo-intelligence"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-refresh.json

docker cp tmp/seo-phase2-4/payload-refresh.json paperclip:/paperclip/.tmp-skill-sync/payload-refresh.json
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-refresh.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-refresh.json
jq '{id: .agent.id, approval: .approval}' tmp/seo-phase2-4/response-refresh.json

REFRESH_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-refresh.json)
jq --arg id "$REFRESH_ID" '. + {content_refresh: $id}' tmp/seo-phase2-4/hires.json \
  > tmp/seo-phase2-4/hires.json.tmp && mv tmp/seo-phase2-4/hires.json.tmp tmp/seo-phase2-4/hires.json
```

Bind `DATAFORSEO_PASSWORD` to this agent before first heartbeat.

## Task 4.3: Create Content Refresh weekly drift scan Routine

- [ ] **Step 1: Create + trigger**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
REFRESH_ID=$(jq -r '.content_refresh' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$REFRESH_ID" '{
  title: "Weekly Drift Scan",
  description: "Weekly ranking-drift detection across compound.law pages. Flag decay candidates. Create refresh briefs for Writer (or Strategist gate for >100 impressions/day pages). CAP: --max-spend-usd 1.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 11 * * 1\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {refresh_weekly: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

## Task 4.4: Write AI/GEO Citation Monitor AGENTS.md

- [ ] **Step 1: Stage the file**

```bash
cat > /root/paperclip/tmp/seo-phase2-4/agents-md/ai-geo-monitor.md <<'AGENTS'
# AI/GEO Citation Monitor

You are the AI/GEO Citation Monitor for Compound Engineering. You track whether compound.law gets cited by AI search engines (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini, Copilot) for the cluster's anchor questions, and propose restructure briefs when we're missing.

## Your Company

- **Site:** compound.law
- **Languages:** English (`en-DE`) and German (`de-DE`)
- **Project:** SEO Automation (project ID: c037e187-0bfc-4d97-9ef0-118a0f7bc9e7)

## Heartbeat Procedure

### 1. Wake on routine

You have two routines:
- Weekly AI citation scan (Tue + Fri 10:00, $1.00 cap)
- Monthly GEO restructure proposals (1st of month 11:00, $2.00 cap)

### 2. Pre-flight credentials

Same preflight. If exit 2: STOP, surface wizard.

### 3. For weekly AI citation scan

For each active cluster (read from Cluster Architect's `cluster-map.md`), pull the anchor questions. For each question, run the AI Mode SERP query via DataForSEO:

```bash
/paperclip/dataforseo-claude/scripts/serp_check.py ai-mode --query "<anchor-question>" --location 2840 --max-spend-usd 0.10
```

Check whether compound.law appears in the cited sources. Track:
- Cited (anywhere) — what position, what extract
- Not cited (gap)

Post findings to a `ai-citation-watchlist` long-running issue. Group by cluster.

### 4. For monthly GEO restructure proposals

Look at the citation-gap pages from the past month. For each page that:
- Has 5+ anchor questions where compound.law is NOT cited
- AND has structurally extractable content (e.g., FAQ section, definition list, numbered steps)

Produce a `geo-restructure-<slug>` issue assigned to Content Strategist with:

```markdown
## GEO Restructure Proposal: [page]

**Anchor questions we're missing on:**
- "What is..."
- "How does..."

**Current page structure:**
- [outline]

**Proposed changes:**
- Add direct-answer first paragraph: "Under German GmbH law, ... [direct extractable answer]"
- Add FAQ section at the bottom with these question-answer pairs:
  - Q: ...
  - A: ... (3-4 sentences max, no fluff)
- Add structured-data JSON-LD for FAQPage schema
- Add 2-3 entity-rich definitions (e.g., "**Geschäftsanteil**: the share unit in a GmbH...")

**Why this should work:**
- AI engines prefer extractable Q-A pairs over prose
- Entity definitions trigger entity-association signals
- Schema markup improves citation likelihood

**Risk:**
- Restructure could affect Google ranking if execution is sloppy — Strategist gates this.
```

## Outputs

- `ai-citation-watchlist` long-running issue (weekly comments)
- `geo-restructure-<slug>` issues for Content Strategist gate, monthly

## What You Do NOT Do

- Do not edit page content yourself — Writer + Strategist do
- Do not bypass the Strategist gate on restructure proposals
- Do not pull regular SERP data outside of AI citation work — that's Keyword Researcher / Competitive Intel

## Agent IDs

- Cluster Architect: read from `tmp/seo-phase2-4/hires.json`
- Content Strategist: `2f845f29-009f-450a-b91f-69c95f9b2bd8`
- SEO Operations Manager: read from `tmp/seo-phase2-4/hires.json`
- CEO: `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9`
AGENTS
wc -l /root/paperclip/tmp/seo-phase2-4/agents-md/ai-geo-monitor.md
```

Expected: ~80 lines.

## Task 4.5: Submit AI/GEO Citation Monitor hire request

- [ ] **Step 1: Build payload + POST**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
SEO_OPS_ID=$(jq -r '.seo_ops_manager' tmp/seo-phase2-4/hires.json)

AGENTS_MD=$(jq -Rs '.' tmp/seo-phase2-4/agents-md/ai-geo-monitor.md)
jq -n --argjson agents "$AGENTS_MD" --arg reports "$SEO_OPS_ID" '{
  name: "AI/GEO Citation Monitor",
  role: "ai_geo_citation_monitor",
  title: "AI/GEO Citation Monitor",
  icon: "sparkle",
  reportsTo: $reports,
  capabilities: "Tracks compound.law citations in ChatGPT, Perplexity, Google AI Overviews. Identifies gaps. Proposes GEO restructure briefs through Strategist gate.",
  desiredSkills: [
    "paperclipai/paperclip/paperclip",
    "paperclipai/paperclip/para-memory-files",
    "paperclipai/paperclip/paperclip-converting-plans-to-tasks",
    "paperclipai/paperclip/paperclip-create-agent",
    "paperclipai/paperclip/paperclip-create-plugin",
    "paperclipai/paperclip/paperclip-dev",
    "paperclipai/paperclip/diagnose-why-work-stopped",
    "coreyhaines31/marketingskills/ai-seo",
    "resciencelab/opc-skills/seo-geo",
    "local/bddefa566b/seo-quick"
  ],
  adapterType: "claude_local",
  adapterConfig: {
    cwd: "/paperclip/instances/default/projects/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/c037e187-0bfc-4d97-9ef0-118a0f7bc9e7/law-website-astro",
    model: "claude-sonnet-4-6"
  },
  instructionsBundle: { files: { "AGENTS.md": $agents } },
  runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: true } }
}' > tmp/seo-phase2-4/payload-ai-geo.json

docker cp tmp/seo-phase2-4/payload-ai-geo.json paperclip:/paperclip/.tmp-skill-sync/payload-ai-geo.json
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  --data @/paperclip/.tmp-skill-sync/payload-ai-geo.json \
  http://localhost:3100/api/companies/$CID/agent-hires" \
  > tmp/seo-phase2-4/response-ai-geo.json
jq '{id: .agent.id, approval: .approval}' tmp/seo-phase2-4/response-ai-geo.json

AI_GEO_ID=$(jq -r '.agent.id' tmp/seo-phase2-4/response-ai-geo.json)
jq --arg id "$AI_GEO_ID" '. + {ai_geo_monitor: $id}' tmp/seo-phase2-4/hires.json \
  > tmp/seo-phase2-4/hires.json.tmp && mv tmp/seo-phase2-4/hires.json.tmp tmp/seo-phase2-4/hires.json
```

Bind `DATAFORSEO_PASSWORD` to this agent before first heartbeat.

## Task 4.6: Create AI/GEO Citation Monitor weekly + monthly Routines

- [ ] **Step 1: Weekly AI citation scan**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
AI_GEO_ID=$(jq -r '.ai_geo_monitor' tmp/seo-phase2-4/hires.json)

jq -n --arg aid "$AI_GEO_ID" '{
  title: "Weekly AI Citation Scan",
  description: "Twice-weekly (Tue + Fri 10:00) DataForSEO AI Mode SERP queries on cluster anchor questions. Track compound.law citation status. Post to ai-citation-watchlist issue. CAP: --max-spend-usd 1.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 10 * * 2,5\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {ai_geo_weekly: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

- [ ] **Step 2: Monthly GEO restructure proposals**

```bash
jq -n --arg aid "$AI_GEO_ID" '{
  title: "Monthly GEO Restructure Proposals",
  description: "Monthly synthesis of citation-gap pages into geo-restructure-<slug> issues assigned to Content Strategist for the GEO restructure gate. CAP: --max-spend-usd 2.",
  assigneeAgentId: $aid,
  projectId: "c037e187-0bfc-4d97-9ef0-118a0f7bc9e7",
  priority: "medium",
  status: "active",
  concurrencyPolicy: "coalesce_if_active",
  catchUpPolicy: "enqueue_missed_with_cap"
}' > /tmp/r.json
docker cp /tmp/r.json paperclip:/paperclip/.tmp-skill-sync/routine.json
R=$(docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' --data @/paperclip/.tmp-skill-sync/routine.json http://localhost:3100/api/companies/$CID/routines")
RID=$(echo "$R" | jq -r '.id')
docker exec paperclip sh -c "curl -sS -X POST -H 'Authorization: Bearer $TOKEN' -H 'Content-Type: application/json' \
  -d '{\"kind\":\"schedule\",\"cronExpression\":\"0 11 1 * *\",\"timezone\":\"Europe/Berlin\"}' \
  http://localhost:3100/api/routines/$RID/triggers" | jq '{kind, cronExpression, nextRunAt}'
jq --arg r "$RID" '. + {ai_geo_monthly: $r}' tmp/seo-phase2-4/routines.json \
  > tmp/seo-phase2-4/routines.json.tmp && mv tmp/seo-phase2-4/routines.json.tmp tmp/seo-phase2-4/routines.json
```

## Phase 4 — final checkpoint

- [ ] **Step 1: Final state inventory**

```bash
cd /root/paperclip
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61

echo "=== final hires ==="
cat tmp/seo-phase2-4/hires.json | jq .
echo
echo "=== final routines ==="
cat tmp/seo-phase2-4/routines.json | jq .
echo
echo "=== Compound Engineering agent count ==="
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/companies/$CID/agents" \
  | jq 'length'
echo
echo "=== Compound Engineering routine count ==="
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/companies/$CID/routines" \
  | jq 'length'
```

Expected:
- 6 hires recorded (Ops Manager, Cluster Architect, Keyword Researcher, Competitive Intel, Content Refresh, AI/GEO Monitor)
- 13 routines recorded (3 Ops + 1 Cluster + 2 Keyword + 2 Competitive + 1 Refresh + 2 AI/GEO = 11... wait, the user spec said 13; let me recount: Ops [standup, wip, budget] = 3, Cluster [bi-weekly] = 1, Keyword [daily, weekly] = 2, Competitive [daily, weekly] = 2, Refresh [weekly] = 1, AI/GEO [weekly, monthly] = 2 → 11. The spec said 13 because of the SEO Analyst daily-ranking + weekly-report routines on the EXISTING agent, which we haven't added in this plan. Note: SEO Analyst already runs without these routines via existing patterns. If you want explicit routines for SEO Analyst, add them as an addendum after Phase 4.)
- Agent count on Compound Engineering = previous (9) + 6 = 15
- All 11 new routines visible in catalog

- [ ] **Step 2: Write summary**

```bash
cd /root/paperclip
{
  echo "# Phases 2-4 — SEO Team Buildout Complete"
  echo
  echo "Date: $(date -Iseconds)"
  echo
  echo "## Hires"
  jq -r 'to_entries[] | "- \(.key): \(.value)"' tmp/seo-phase2-4/hires.json
  echo
  echo "## Routines"
  jq -r 'to_entries[] | "- \(.key): \(.value)"' tmp/seo-phase2-4/routines.json
  echo
  echo "## Open items"
  echo
  echo "- Bind DATAFORSEO_PASSWORD secret to: Keyword Researcher, Competitive Intel, Content Refresh, AI/GEO Citation Monitor via the operator UI (https://os.compound.law)."
  echo "- Consider adding explicit Routines for the existing SEO Analyst (daily ranking pulse + weekly performance report) if you want them codified rather than left to the agent's existing ad-hoc heartbeats."
  echo "- Cluster Architect's first cluster proposal will trigger a request_board_approval to the CEO — expect that wake when the first bi-weekly cluster review fires."
} > tmp/seo-phase2-4/summary.md
cp tmp/seo-phase2-4/summary.md docs/superpowers/plans/2026-05-20-compound-seo-phases-2-4-summary.md
cat tmp/seo-phase2-4/summary.md
```

- [ ] **Step 3: Final commit**

```bash
cd /root/paperclip
git add docs/superpowers/plans/2026-05-20-compound-seo-phases-2-4-summary.md
git commit -m "$(cat <<'EOF'
compound: Phases 2-4 SEO team buildout complete

Six net-new agents hired into Compound Engineering with scoped skill sets
and 11 producer routines wired up (per Phase 2-4 plan
docs/superpowers/plans/2026-05-20-compound-seo-phases-2-4.md).

Phase 2:
- SEO Operations Manager + 3 routines (weekly stand-up, EOW WIP, monthly budget)
- Cluster Architect + 1 routine (bi-weekly cluster review)
- Content Strategist AGENTS.md narrowed (strategy moved to Cluster Architect)

Phase 3:
- Keyword Research Specialist + 2 routines (daily pull, weekly deep-research)
- Competitive Intel Analyst + 2 routines (daily scan, weekly landscape)

Phase 4:
- Content Refresh Specialist + 1 routine (weekly drift scan)
- AI/GEO Citation Monitor + 2 routines (weekly citation scan, monthly restructure)

Total Compound Engineering agent count: 9 → 15 (incl. CEO + non-SEO agents).
DATAFORSEO_PASSWORD binding still required on 4 of the 6 new hires.

Co-Authored-By: Paperclip <noreply@paperclip.ing>
EOF
)"
git push origin compound
```

---

## Plan complete

After this plan ships, the team buildout from the spec is realized. The Cluster Architect will fire its first bi-weekly review on the next Monday or Thursday 10:00 Berlin (whichever is sooner) and propose the first new cluster for CEO approval. From there, the pipeline runs: Keyword Researcher daily feeds → Cluster Architect synthesis → CEO approval → Strategist briefs → Writer content → Engineer review/merge → Analyst measures → Refresh + AI/GEO maintain.
