# Compound SEO Team Buildout — Phase 1: Skill Re-scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope each existing Compound Engineering agent's installed skill set down to exactly the matrix in the design spec, eliminating ~2.5KB of auto-bundled skill metadata per heartbeat and removing the primary trigger of the recent 1M-context API failures.

**Architecture:** No new agents created in this phase. We only narrow `skills/sync` lists on the 5 existing agents (CEO, Content Strategist, Content Writer, SEO Engineer, SEO Analyst) via the Paperclip board-level API. Each call replaces the agent's full skill set, so we must compose every assignment precisely. Verification is a heartbeat that completes without an API error.

**Tech Stack:** Paperclip control-plane REST API (`POST /api/agents/:agentId/skills/sync`), `curl` + `jq` for shaping payloads, the running container's `paperclipai` CLI for board auth.

**Prerequisite — Spec:** `docs/superpowers/specs/2026-05-20-compound-seo-team-buildout-design.md` (the section "Skill assignment per agent" is the authoritative table).

**Spec coverage in this plan:** Spec sections "Universal baseline", "Per-agent SEO skill assignments", "Explicit exclusions", and "Phase 1 — Skill scope on existing agents" of the Rollout plan. Phases 2-4 are out of scope here and will get their own plan.

---

## File Structure

This phase makes API calls only. No code or AGENTS.md changes. Two artifacts created on disk for traceability:

- Create: `tmp/seo-phase1/skill-keys.json` — canonical skill-key inventory captured at start, never committed (gitignored under `tmp/`).
- Create: `tmp/seo-phase1/before-after.json` — per-agent skill list snapshots before+after each sync, for the verification diff.

If `tmp/` is not already gitignored, the first task confirms it.

---

## Agent + Skill Key Reference (recorded at runtime in Task 1)

Agent UUIDs (Compound Engineering, `1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61`):

| Role | Agent ID |
|---|---|
| CEO | `71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9` |
| Content Strategist | `2f845f29-009f-450a-b91f-69c95f9b2bd8` |
| Content Writer | `37d062f6-2b09-4c6b-9baf-96801b8b8930` |
| SEO Engineer | `c1db28a5-2d7d-4c62-b292-85e32dea5912` |
| SEO Analyst | `a2dc5855-61a4-467c-8950-d9a7693e535c` |

Skill slugs we will look up canonical keys for in Task 1 (these are the slugs from each `SKILL.md` frontmatter `name:` field, not the keys themselves):

Universal baseline (every agent):
- `paperclip`
- `para-memory-files`
- `paperclip-converting-plans-to-tasks`
- `paperclip-create-agent`
- `paperclip-create-plugin`
- `paperclip-dev`
- `diagnose-why-work-stopped`

SEO skills used by ≥1 agent:
- `seo-content`, `seo-content-gap`, `seo-quick`, `seo-keywords`, `seo-rankings`, `seo-watchlist`, `seo-competitors`, `seo-compare`, `seo-backlinks`, `seo-audit`, `seo-technical`, `seo-geo`, `ai-seo`, `seo-report`, `seo-report-pdf`, `programmatic-seo`, `dataforseo-seo-intelligence`

**Excluded from every agent (must NOT appear in any sync payload):** `seo` (the dataforseo-claude orchestrator), `semrush-research`.

---

## Tasks

### Task 1: Board auth + capture skill key inventory

**Files:**
- Create: `tmp/seo-phase1/skill-keys.json`

This task establishes board-level CLI auth (one-time per session) and produces a slug→key mapping the rest of the plan references.

- [ ] **Step 1: Verify `tmp/` is gitignored**

Run:
```bash
grep -E '^tmp/?$|^/tmp/?$' /root/paperclip/.gitignore
```

Expected: matches at least one line. If empty, add `tmp/` to `.gitignore`:
```bash
echo 'tmp/' >> /root/paperclip/.gitignore
```

- [ ] **Step 2: Log the CLI in as a board user**

Run inside the container so the CLI uses the live API:
```bash
docker exec -it paperclip sh -c 'cd /app && pnpm paperclipai auth login'
```

Expected: the CLI prints a URL like `https://os.compound.law/auth/cli?code=…`. Open it in a browser, approve. Then back in the terminal:

```bash
docker exec paperclip sh -c 'cd /app && pnpm paperclipai auth whoami'
```

Expected: prints your board-user email. If `API error 401`, the approval didn't complete — retry login.

- [ ] **Step 3: Dump the company skill catalog**

```bash
mkdir -p /root/paperclip/tmp/seo-phase1
docker exec paperclip sh -c 'cd /app && pnpm paperclipai company list --json' \
  > /tmp/companies.json
# Sanity-check Compound Engineering shows up:
jq -r '.[] | select(.id=="1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61") | .name' /tmp/companies.json
```

Expected: prints a name (e.g., "Compound Engineering" or the local label).

```bash
docker exec paperclip sh -c \
  'curl -sS -H "Authorization: Bearer $(cat /tmp/cli-token 2>/dev/null || pnpm paperclipai context show --json | jq -r .apiKey)" \
   http://localhost:3100/api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/skills' \
  | jq '.skills | map({slug, key, name})' \
  > /root/paperclip/tmp/seo-phase1/skill-keys.json
wc -l /root/paperclip/tmp/seo-phase1/skill-keys.json
```

Expected: file has ≥17 entries (7 baseline + 13 dataforseo-claude + dataforseo-seo-intelligence + 5 runtime SEO skills + paperclip-bundled ops).

- [ ] **Step 4: Verify every required slug has a key**

```bash
cd /root/paperclip
for slug in paperclip para-memory-files paperclip-converting-plans-to-tasks \
            paperclip-create-agent paperclip-create-plugin paperclip-dev \
            diagnose-why-work-stopped \
            seo-content seo-content-gap seo-quick seo-keywords seo-rankings \
            seo-watchlist seo-competitors seo-compare seo-backlinks seo-audit \
            seo-technical seo-geo ai-seo seo-report seo-report-pdf \
            programmatic-seo dataforseo-seo-intelligence; do
  key=$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .key' tmp/seo-phase1/skill-keys.json | head -1)
  [ -z "$key" ] && echo "MISSING: $slug" || echo "OK: $slug -> $key"
done
```

Expected: every slug prints `OK: <slug> -> <key>`. If any prints `MISSING`, the bundled-discovery hasn't yet registered that skill — run `docker exec paperclip sh -c 'curl -sS http://localhost:3100/api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/skills?refresh=true ...'` to force a refresh, then re-check.

- [ ] **Step 5: Snapshot the "before" state for each of the 5 existing agents**

```bash
mkdir -p /root/paperclip/tmp/seo-phase1/before
for aid in 71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9 \
           2f845f29-009f-450a-b91f-69c95f9b2bd8 \
           37d062f6-2b09-4c6b-9baf-96801b8b8930 \
           c1db28a5-2d7d-4c62-b292-85e32dea5912 \
           a2dc5855-61a4-467c-8950-d9a7693e535c; do
  docker exec paperclip sh -c \
    "curl -sS -H \"Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)\" \
     http://localhost:3100/api/agents/$aid/skills" \
    | jq '.skills | map({slug, key, name})' \
    > "/root/paperclip/tmp/seo-phase1/before/$aid.json"
  wc -l "/root/paperclip/tmp/seo-phase1/before/$aid.json"
done
```

Expected: 5 files, each with 1+ skills. Many will likely show ≥15 skills (the auto-bundled state).

---

### Task 2: Sync CEO skills (baseline 7 only)

**Files:**
- Create: `tmp/seo-phase1/after/71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9.json`

CEO has no SEO skills. Strategic role only.

- [ ] **Step 1: Build the CEO sync payload**

```bash
cd /root/paperclip
AID=71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9
jq -n --argjson keys "$(jq '[.[] | select(.slug | IN(
  "paperclip","para-memory-files","paperclip-converting-plans-to-tasks",
  "paperclip-create-agent","paperclip-create-plugin","paperclip-dev",
  "diagnose-why-work-stopped"
)) | .key] | map({key:.})' tmp/seo-phase1/skill-keys.json)" \
  '{skills: $keys}' > tmp/seo-phase1/ceo-payload.json
jq '.skills | length' tmp/seo-phase1/ceo-payload.json
```

Expected: `7`.

- [ ] **Step 2: Sync**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   --data @- http://localhost:3100/api/agents/$AID/skills/sync" \
  < tmp/seo-phase1/ceo-payload.json | jq '.synced // .error'
```

Expected: `synced: 7` or similar success indicator. If `.error`, stop and debug — likely auth or key mismatch.

- [ ] **Step 3: Verify the agent now sees exactly those 7 skills**

```bash
mkdir -p /root/paperclip/tmp/seo-phase1/after
docker exec paperclip sh -c \
  "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   http://localhost:3100/api/agents/$AID/skills" \
  | jq '.skills | map(.slug) | sort' \
  > tmp/seo-phase1/after/$AID.json
diff <(jq '.skills | map(.key) | sort' tmp/seo-phase1/ceo-payload.json) \
     <(docker exec paperclip sh -c \
       "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
        http://localhost:3100/api/agents/$AID/skills" | jq '.skills | map(.key) | sort')
```

Expected: empty diff. If diff is non-empty, the sync was incomplete; re-run Step 2.

---

### Task 3: Sync Content Strategist skills (baseline 7 + 3 SEO)

**Files:**
- Create: `tmp/seo-phase1/after/2f845f29-009f-450a-b91f-69c95f9b2bd8.json`

Skills: 7 baseline + `seo-content`, `seo-content-gap`, `dataforseo-seo-intelligence`.

- [ ] **Step 1: Build the Content Strategist payload**

```bash
cd /root/paperclip
AID=2f845f29-009f-450a-b91f-69c95f9b2bd8
jq -n --argjson keys "$(jq '[.[] | select(.slug | IN(
  "paperclip","para-memory-files","paperclip-converting-plans-to-tasks",
  "paperclip-create-agent","paperclip-create-plugin","paperclip-dev",
  "diagnose-why-work-stopped",
  "seo-content","seo-content-gap","dataforseo-seo-intelligence"
)) | .key] | map({key:.})' tmp/seo-phase1/skill-keys.json)" \
  '{skills: $keys}' > tmp/seo-phase1/strategist-payload.json
jq '.skills | length' tmp/seo-phase1/strategist-payload.json
```

Expected: `10`.

- [ ] **Step 2: Sync**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   --data @- http://localhost:3100/api/agents/$AID/skills/sync" \
  < tmp/seo-phase1/strategist-payload.json | jq '.synced // .error'
```

Expected: `synced: 10`.

- [ ] **Step 3: Verify**

```bash
diff <(jq '.skills | map(.key) | sort' tmp/seo-phase1/strategist-payload.json) \
     <(docker exec paperclip sh -c \
       "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
        http://localhost:3100/api/agents/$AID/skills" | jq '.skills | map(.key) | sort')
```

Expected: empty diff.

---

### Task 4: Sync Content Writer skills (baseline 7 only)

**Files:**
- Create: `tmp/seo-phase1/after/37d062f6-2b09-4c6b-9baf-96801b8b8930.json`

Writer writes from briefs. No SEO data tools needed.

- [ ] **Step 1: Build the Content Writer payload**

```bash
cd /root/paperclip
AID=37d062f6-2b09-4c6b-9baf-96801b8b8930
jq -n --argjson keys "$(jq '[.[] | select(.slug | IN(
  "paperclip","para-memory-files","paperclip-converting-plans-to-tasks",
  "paperclip-create-agent","paperclip-create-plugin","paperclip-dev",
  "diagnose-why-work-stopped"
)) | .key] | map({key:.})' tmp/seo-phase1/skill-keys.json)" \
  '{skills: $keys}' > tmp/seo-phase1/writer-payload.json
jq '.skills | length' tmp/seo-phase1/writer-payload.json
```

Expected: `7`.

- [ ] **Step 2: Sync**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   --data @- http://localhost:3100/api/agents/$AID/skills/sync" \
  < tmp/seo-phase1/writer-payload.json | jq '.synced // .error'
```

Expected: `synced: 7`.

- [ ] **Step 3: Verify**

```bash
diff <(jq '.skills | map(.key) | sort' tmp/seo-phase1/writer-payload.json) \
     <(docker exec paperclip sh -c \
       "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
        http://localhost:3100/api/agents/$AID/skills" | jq '.skills | map(.key) | sort')
```

Expected: empty diff.

---

### Task 5: Sync SEO Engineer skills (baseline 7 + 4 SEO)

**Files:**
- Create: `tmp/seo-phase1/after/c1db28a5-2d7d-4c62-b292-85e32dea5912.json`

Skills: 7 baseline + `seo-audit`, `seo-technical`, `seo-quick`, `seo-geo`.

- [ ] **Step 1: Build the SEO Engineer payload**

```bash
cd /root/paperclip
AID=c1db28a5-2d7d-4c62-b292-85e32dea5912
jq -n --argjson keys "$(jq '[.[] | select(.slug | IN(
  "paperclip","para-memory-files","paperclip-converting-plans-to-tasks",
  "paperclip-create-agent","paperclip-create-plugin","paperclip-dev",
  "diagnose-why-work-stopped",
  "seo-audit","seo-technical","seo-quick","seo-geo"
)) | .key] | map({key:.})' tmp/seo-phase1/skill-keys.json)" \
  '{skills: $keys}' > tmp/seo-phase1/engineer-payload.json
jq '.skills | length' tmp/seo-phase1/engineer-payload.json
```

Expected: `11`.

- [ ] **Step 2: Sync**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   --data @- http://localhost:3100/api/agents/$AID/skills/sync" \
  < tmp/seo-phase1/engineer-payload.json | jq '.synced // .error'
```

Expected: `synced: 11`.

- [ ] **Step 3: Verify**

```bash
diff <(jq '.skills | map(.key) | sort' tmp/seo-phase1/engineer-payload.json) \
     <(docker exec paperclip sh -c \
       "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
        http://localhost:3100/api/agents/$AID/skills" | jq '.skills | map(.key) | sort')
```

Expected: empty diff.

---

### Task 6: Sync SEO Analyst skills (baseline 7 + 5 SEO)

**Files:**
- Create: `tmp/seo-phase1/after/a2dc5855-61a4-467c-8950-d9a7693e535c.json`

Skills: 7 baseline + `seo-rankings`, `seo-watchlist`, `dataforseo-seo-intelligence`, `seo-report`, `seo-report-pdf`.

- [ ] **Step 1: Build the SEO Analyst payload**

```bash
cd /root/paperclip
AID=a2dc5855-61a4-467c-8950-d9a7693e535c
jq -n --argjson keys "$(jq '[.[] | select(.slug | IN(
  "paperclip","para-memory-files","paperclip-converting-plans-to-tasks",
  "paperclip-create-agent","paperclip-create-plugin","paperclip-dev",
  "diagnose-why-work-stopped",
  "seo-rankings","seo-watchlist","dataforseo-seo-intelligence",
  "seo-report","seo-report-pdf"
)) | .key] | map({key:.})' tmp/seo-phase1/skill-keys.json)" \
  '{skills: $keys}' > tmp/seo-phase1/analyst-payload.json
jq '.skills | length' tmp/seo-phase1/analyst-payload.json
```

Expected: `12`.

- [ ] **Step 2: Sync**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   --data @- http://localhost:3100/api/agents/$AID/skills/sync" \
  < tmp/seo-phase1/analyst-payload.json | jq '.synced // .error'
```

Expected: `synced: 12`.

- [ ] **Step 3: Verify**

```bash
diff <(jq '.skills | map(.key) | sort' tmp/seo-phase1/analyst-payload.json) \
     <(docker exec paperclip sh -c \
       "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
        http://localhost:3100/api/agents/$AID/skills" | jq '.skills | map(.key) | sort')
```

Expected: empty diff.

---

### Task 7: Verify the `seo` orchestrator and `semrush-research` are assigned to nobody

**Files:**
- Create: `tmp/seo-phase1/exclusion-audit.txt`

The spec mandates these two skills are assigned to NO agent.

- [ ] **Step 1: Audit**

```bash
cd /root/paperclip
{
  echo "=== Skills that must not be assigned to any agent ==="
  for slug in seo semrush-research; do
    key=$(jq -r --arg s "$slug" '.[] | select(.slug==$s) | .key' tmp/seo-phase1/skill-keys.json | head -1)
    if [ -z "$key" ]; then
      echo "$slug: not registered (OK)"
      continue
    fi
    holders=""
    for aid in 71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9 \
               2f845f29-009f-450a-b91f-69c95f9b2bd8 \
               37d062f6-2b09-4c6b-9baf-96801b8b8930 \
               c1db28a5-2d7d-4c62-b292-85e32dea5912 \
               a2dc5855-61a4-467c-8950-d9a7693e535c; do
      has=$(docker exec paperclip sh -c \
        "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
         http://localhost:3100/api/agents/$aid/skills" \
        | jq -r --arg k "$key" '.skills[] | select(.key==$k) | .slug')
      [ -n "$has" ] && holders="$holders $aid"
    done
    if [ -n "$holders" ]; then
      echo "$slug: STILL ASSIGNED to:$holders"
    else
      echo "$slug: cleanly excluded (OK)"
    fi
  done
} | tee tmp/seo-phase1/exclusion-audit.txt
```

Expected: both lines end in `(OK)`. If any says `STILL ASSIGNED`, repeat the sync for that agent — the payload must have included an unintended key.

---

### Task 8: Trigger a test heartbeat on Content Strategist

**Files:** none

This task verifies the rescoping actually prevents the 1M context error in a live heartbeat. Content Strategist is the agent we know previously hit the error, so it's the canonical test.

- [ ] **Step 1: Create a tiny test issue assigned to Content Strategist**

```bash
docker exec paperclip sh -c "\
  curl -sS -X POST \
   -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   -H 'Content-Type: application/json' \
   -d '{
     \"title\": \"Phase 1 verification — confirm rescoping worked\",
     \"description\": \"After skill rescoping, confirm this heartbeat completes without a 1M context error. Reply with one sentence acknowledging the new skill list and exit.\",
     \"assigneeAgentId\": \"2f845f29-009f-450a-b91f-69c95f9b2bd8\",
     \"priority\": \"low\",
     \"status\": \"todo\",
     \"projectId\": \"c037e187-0bfc-4d97-9ef0-118a0f7bc9e7\"
   }' \
   http://localhost:3100/api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/issues" \
  | jq '{id, identifier, status, assigneeAgentId}'
```

Expected: a JSON object with `status: "todo"` and `assigneeAgentId: "2f845f29-…"`. Capture the issue ID for the next step.

- [ ] **Step 2: Watch the latest Content Strategist run log for the heartbeat**

The next heartbeat scheduler will pick up the new issue. Wait up to 5 minutes, then check:

```bash
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61
AID=2f845f29-009f-450a-b91f-69c95f9b2bd8
LATEST=$(docker exec paperclip sh -c "ls -t /paperclip/instances/default/data/run-logs/$CID/$AID | head -1")
echo "Latest run log: $LATEST"
docker exec paperclip grep -c 'Usage credits required for 1M context' \
  /paperclip/instances/default/data/run-logs/$CID/$AID/$LATEST 2>&1
```

Expected: `0`. If `>0`, the rescoping alone wasn't sufficient — the agent's working context is what's triggering 1M, not skill metadata. Document in the issue thread that account-level usage credits are still required.

- [ ] **Step 3: Confirm the issue moved to done or got a real comment**

```bash
docker exec paperclip sh -c "\
  curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
   http://localhost:3100/api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/issues?assigneeAgentId=2f845f29-009f-450a-b91f-69c95f9b2bd8&q=Phase+1+verification" \
  | jq '.issues[0] | {identifier, status, latestComment: .comments[-1].body}'
```

Expected: `status` is `done` or `in_progress` AND `latestComment` contains a one-sentence acknowledgement. If still `todo` and the run log shows no activity, the scheduler didn't wake the agent — manually wake via the manual-run endpoint or wait for the next scheduled heartbeat.

---

### Task 9: Final snapshot + summary

**Files:**
- Create: `tmp/seo-phase1/summary.md`

- [ ] **Step 1: Write the human-readable rollout summary**

```bash
cd /root/paperclip
{
  echo "# Phase 1 — Skill Rescoping Complete"
  echo
  echo "Date: $(date -Iseconds)"
  echo
  echo "## Per-agent final skill set"
  for aid in 71ac6fdc-4d5a-4b9e-928e-d3d4d8c086b9 \
             2f845f29-009f-450a-b91f-69c95f9b2bd8 \
             37d062f6-2b09-4c6b-9baf-96801b8b8930 \
             c1db28a5-2d7d-4c62-b292-85e32dea5912 \
             a2dc5855-61a4-467c-8950-d9a7693e535c; do
    role=$(docker exec paperclip sh -c \
      "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
       http://localhost:3100/api/agents/$aid" | jq -r '.name // .role')
    echo
    echo "### $role ($aid)"
    docker exec paperclip sh -c \
      "curl -sS -H 'Authorization: Bearer \$(pnpm paperclipai context show --json | jq -r .apiKey)' \
       http://localhost:3100/api/agents/$aid/skills" \
      | jq -r '.skills | map(.slug) | sort | .[] | "- " + .'
  done
  echo
  echo "## Exclusion audit"
  cat tmp/seo-phase1/exclusion-audit.txt
} > tmp/seo-phase1/summary.md
cat tmp/seo-phase1/summary.md
```

Expected: a markdown file with 5 agent sections, each listing only the skills from the matrix.

- [ ] **Step 2: Commit the summary (not the credentials, not the before/after payloads)**

```bash
cd /root/paperclip
cp tmp/seo-phase1/summary.md docs/superpowers/plans/2026-05-20-compound-seo-phase1-summary.md
git add docs/superpowers/plans/2026-05-20-compound-seo-phase1-summary.md
git commit -m "$(cat <<'EOF'
compound: Phase 1 SEO team buildout — skill rescoping complete

Rescoped skill assignments on the 5 existing Compound Engineering
agents (CEO, Content Strategist, Content Writer, SEO Engineer,
SEO Analyst) per spec docs/superpowers/specs/2026-05-20-compound-
seo-team-buildout-design.md. Each agent now sees only the matrix-
defined skill set; the heavy seo orchestrator and semrush-research
remain excluded.

Co-Authored-By: Paperclip <noreply@paperclip.ing>
EOF
)"
```

Expected: a new commit on the `compound` branch.

---

## Phase 1 done — checkpoint

At this point:
- All 5 existing agents have scoped skill assignments per the matrix.
- The `seo` orchestrator and `semrush-research` are excluded from every agent.
- A live heartbeat on the previously-failing Content Strategist either completed cleanly OR confirmed the residual 1M-context issue is from working context (not skill overhead), which requires enabling Claude usage credits as a separate fix.

The next phase plan (Phases 2-4 — hire 6 new agents + routines) will be written after Phase 1 ships. The two phases are decoupled by design: the 5 existing agents are fully operational at the end of Phase 1 regardless of what comes next.
