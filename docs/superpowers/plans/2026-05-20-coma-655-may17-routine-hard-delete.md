# Hard-Delete COMA-655 May 17 Archived Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard-delete routine `ad55fc07-6d94-4c95-8140-2334e5a285c3` ("COMA-655: May 17 CTR re-check for DPA pages"), currently in `archived` status, and all DB rows that reference it. This is destructive — there is no Paperclip API for hard-delete; the only route is direct SQL against the Supabase postgres backing this instance.

**Architecture:** The compound-os container connects to Supabase at `aws-1-eu-west-1.pooler.supabase.com:5432` (DATABASE_URL env, overriding the config.json's embedded-postgres setting). We install `psql` locally, connect with the same DATABASE_URL, discover every foreign-key reference to `routines.id`, take a focused logical backup of affected rows + an automated full backup, then DELETE in FK dependency order (or rely on `ON DELETE CASCADE` if present). Verify by row-count and a Paperclip server health probe.

**Tech Stack:** PostgreSQL 15 (Supabase-hosted), `psql` client, `pg_dump` for backup, the running container's hourly backup hook as additional safety.

**Prerequisite — Memory feedback:** [[feedback_no_db_migrations]] mandates explicit per-action approval before mutating the real DB on `/root/paperclip`. The user's "make a plan to delete" request is approval to PLAN. Each destructive task in this plan has a `WAIT FOR USER APPROVAL` gate before execution.

---

## Scope check

This plan only deletes ONE specific routine row + its dependent rows (triggers, revisions, runs, run-issue links, audit entries). It does NOT touch:
- The parent issue (`de9ccfe1-4f6d-40f3-9100-eddd6234df62` — `COMA-655`)
- Other routines (including the still-active May 24 sibling, `c76cd3b3…`)
- Any agent records
- Comments on the parent issue (the routine's history of contributions to it)

If FK discovery shows cascade reaches further than triggers + revisions + runs, **stop and reassess** before proceeding.

---

## File Structure

- Create: `tmp/coma-655-delete/connection-test.txt` — output from initial psql probe
- Create: `tmp/coma-655-delete/schema-discovery.sql` — discovery query + output
- Create: `tmp/coma-655-delete/backup-affected-rows.sql` — pg_dump output for the affected rows only (also: a full DB backup via Paperclip's backup hook)
- Create: `tmp/coma-655-delete/delete-plan.sql` — the actual DELETE statements (NOT executed until approval)
- Create: `tmp/coma-655-delete/post-verification.txt` — row counts before+after, server health check
- The `tmp/` dir is already gitignored from Phase 1.

---

## Universal helpers

```bash
# Extract DATABASE_URL from container's docker config (NOT from .env on host — same value but
# the container is the canonical source). The URL contains the password in plain text — keep it
# in shell var only, never tee to disk.
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
echo "DATABASE_URL length: ${#DBURL}"  # sanity: ~100+ chars

# Target routine
ROUTINE_ID=ad55fc07-6d94-4c95-8140-2334e5a285c3
PARENT_ISSUE_ID=de9ccfe1-4f6d-40f3-9100-eddd6234df62  # COMA-655 — must NOT be touched
SIBLING_ROUTINE_ID=c76cd3b3-e8b6-4fde-990f-105a1fbb5553  # COMA-655 May 24 — must NOT be touched
```

---

## Tasks

### Task 1: Install postgres client locally

**Files:** none

We need `psql` and `pg_dump` on this VPS (not inside the container — the container's process won't expose a client to us). `apt install postgresql-client` is the standard path.

- [ ] **Step 1: Check current availability**

```bash
which psql pg_dump 2>&1
```

Expected: nothing (or both missing). If present, skip to Task 2.

- [ ] **Step 2: Install the postgres-client meta-package**

```bash
apt-get update -qq && apt-get install -y --no-install-recommends postgresql-client 2>&1 | tail -3
which psql pg_dump
psql --version
```

Expected: psql 15.x or 16.x. Should be ≥13 to support Supabase's pooler.

---

### Task 2: Connect + verify the target routine

**Files:**
- Create: `tmp/coma-655-delete/connection-test.txt`

- [ ] **Step 1: Establish DB connection over TLS**

```bash
mkdir -p /root/paperclip/tmp/coma-655-delete
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" -c "SELECT version();" 2>&1 | tee /root/paperclip/tmp/coma-655-delete/connection-test.txt
```

Expected: PostgreSQL 15.x or similar version banner. If TLS handshake errors or connection refused, stop — check the pool's `sslmode=require` setting (Supabase usually requires it but pooler may accept without).

- [ ] **Step 2: Verify the routine to delete exists + matches expectation**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" -c "
SELECT id, title, status, assignee_agent_id, project_id, created_at
FROM routines
WHERE id = 'ad55fc07-6d94-4c95-8140-2334e5a285c3';" 2>&1 | tee -a /root/paperclip/tmp/coma-655-delete/connection-test.txt
```

Expected output: 1 row, title starts with "COMA-655: May 17", status = `archived`, assignee_agent_id = SEO Analyst's UUID (`a2dc5855-…`). **If status is not `archived`, STOP** — the routine should have been archived before any hard-delete is considered.

- [ ] **Step 3: Confirm the sibling May 24 routine is NOT in the target set**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" -c "
SELECT id, title, status FROM routines
WHERE id IN ('ad55fc07-6d94-4c95-8140-2334e5a285c3', 'c76cd3b3-e8b6-4fde-990f-105a1fbb5553');" \
  | tee -a /root/paperclip/tmp/coma-655-delete/connection-test.txt
```

Expected: 2 rows, one archived (target), one active (sibling — must survive).

---

### Task 3: Discover FK references to routines.id

**Files:**
- Create: `tmp/coma-655-delete/schema-discovery.sql`
- Create: `tmp/coma-655-delete/fk-graph.txt`

- [ ] **Step 1: Find every table whose schema has a FK pointing at routines.id**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" <<'SQL' | tee /root/paperclip/tmp/coma-655-delete/fk-graph.txt
SELECT
  tc.table_name      AS dependent_table,
  kcu.column_name    AS dependent_column,
  ccu.table_name     AS references_table,
  ccu.column_name    AS references_column,
  rc.delete_rule     AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'routines'
  AND ccu.column_name = 'id'
ORDER BY tc.table_name;
SQL
```

Expected: a list like:
```
dependent_table       | dependent_column | references_table | references_column | on_delete
----------------------+------------------+------------------+-------------------+-----------
routine_revisions     | routine_id       | routines         | id                | CASCADE
routine_runs          | routine_id       | routines         | id                | CASCADE
routine_triggers      | routine_id       | routines         | id                | CASCADE
```

(Or NO ACTION/RESTRICT — we'll find out.)

- [ ] **Step 2: For each FK with `on_delete = NO ACTION` or `RESTRICT`, count the rows that reference our target routine**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
RID=ad55fc07-6d94-4c95-8140-2334e5a285c3

# Replace TABLE_LIST with the list from Step 1's output where on_delete != CASCADE
for table in $(awk -F'|' '/NO ACTION|RESTRICT/{print $1}' /root/paperclip/tmp/coma-655-delete/fk-graph.txt | tr -d ' '); do
  echo "=== $table ==="
  psql "$DBURL" -c "SELECT count(*) FROM \"$table\" WHERE routine_id = '$RID';"
done | tee /root/paperclip/tmp/coma-655-delete/non-cascade-counts.txt
```

Expected: zero rows in any table that won't cascade. If non-zero, that table needs an explicit DELETE in our plan BEFORE we delete the routine row.

- [ ] **Step 3: Also check for FKs into the routine_triggers table** (revoke endpoints reference triggers separately)

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" <<'SQL' | tee -a /root/paperclip/tmp/coma-655-delete/fk-graph.txt
SELECT tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'routine_triggers'
ORDER BY tc.table_name;
SQL
```

Expected: any tables that point at `routine_triggers.id` (e.g., trigger_runs, webhook_audit) — note them so deletion handles them.

---

### Task 4: Backup affected rows + take a Paperclip-wide backup

**Files:**
- Create: `tmp/coma-655-delete/backup-affected-rows.sql`
- The container's hourly backup will also fire; we trigger an extra one manually for safety.

- [ ] **Step 1: Logical dump of the rows we're about to delete (insert statements)**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
RID=ad55fc07-6d94-4c95-8140-2334e5a285c3

{
  echo "-- Routine row"
  psql "$DBURL" --csv -c "SELECT * FROM routines WHERE id = '$RID';"
  echo
  echo "-- Triggers"
  psql "$DBURL" --csv -c "SELECT * FROM routine_triggers WHERE routine_id = '$RID';"
  echo
  echo "-- Revisions"
  psql "$DBURL" --csv -c "SELECT * FROM routine_revisions WHERE routine_id = '$RID';"
  echo
  echo "-- Runs"
  psql "$DBURL" --csv -c "SELECT * FROM routine_runs WHERE routine_id = '$RID';"
} > /root/paperclip/tmp/coma-655-delete/backup-affected-rows.sql
chmod 600 /root/paperclip/tmp/coma-655-delete/backup-affected-rows.sql
wc -l /root/paperclip/tmp/coma-655-delete/backup-affected-rows.sql
```

Expected: file is non-empty; at minimum 1 routine row + 1 trigger + N revisions + 1 run (it fired once on May 17). If any of these queries error because the table name is wrong, the schema-discovery step has more accurate names — use those.

- [ ] **Step 2: Trigger a fresh full backup via Paperclip's backup hook**

```bash
docker exec paperclip /app/scripts/backup-db.sh 2>&1 | tail -5
```

Expected: a new file appears in `/paperclip/instances/default/data/backups/`. Verify:

```bash
docker exec paperclip ls -lh /paperclip/instances/default/data/backups/ | tail -3
```

If the backup script fails, **STOP**. Don't proceed without a recovery snapshot.

---

### Task 5: Construct the DELETE plan

**Files:**
- Create: `tmp/coma-655-delete/delete-plan.sql`

- [ ] **Step 1: Write the DELETE statements (single transaction, ROLLBACK by default for dry-run)**

```bash
RID=ad55fc07-6d94-4c95-8140-2334e5a285c3

cat > /root/paperclip/tmp/coma-655-delete/delete-plan.sql <<SQL
-- Hard-delete plan for routine $RID (COMA-655 May 17 CTR re-check)
-- Wrapped in a transaction; default action is ROLLBACK.
-- To execute for real, change "ROLLBACK;" at the end to "COMMIT;"

BEGIN;

-- Pre-delete counts (sanity)
SELECT 'pre-routines' AS scope, count(*) FROM routines WHERE id = '$RID';
SELECT 'pre-triggers' AS scope, count(*) FROM routine_triggers WHERE routine_id = '$RID';
SELECT 'pre-revisions' AS scope, count(*) FROM routine_revisions WHERE routine_id = '$RID';
SELECT 'pre-runs' AS scope, count(*) FROM routine_runs WHERE routine_id = '$RID';

-- Delete in FK dependency order (only needed if FK is NOT cascading)
-- If schema-discovery showed CASCADE on all FKs, just delete from routines and the rest goes too.
-- The plan below is the SAFE order regardless of CASCADE.

DELETE FROM routine_runs       WHERE routine_id = '$RID';
DELETE FROM routine_triggers   WHERE routine_id = '$RID';
DELETE FROM routine_revisions  WHERE routine_id = '$RID';
DELETE FROM routines           WHERE id          = '$RID';

-- Post-delete counts (should all be zero)
SELECT 'post-routines' AS scope, count(*) FROM routines WHERE id = '$RID';
SELECT 'post-triggers' AS scope, count(*) FROM routine_triggers WHERE routine_id = '$RID';
SELECT 'post-revisions' AS scope, count(*) FROM routine_revisions WHERE routine_id = '$RID';
SELECT 'post-runs' AS scope, count(*) FROM routine_runs WHERE routine_id = '$RID';

-- Confirm sibling routine still exists
SELECT 'sibling-still-here' AS scope, title, status FROM routines
WHERE id = 'c76cd3b3-e8b6-4fde-990f-105a1fbb5553';

-- Default to ROLLBACK so this is a dry-run
ROLLBACK;
SQL
chmod 600 /root/paperclip/tmp/coma-655-delete/delete-plan.sql
cat /root/paperclip/tmp/coma-655-delete/delete-plan.sql
```

Expected: a SQL script that wraps the deletion in a transaction with ROLLBACK by default. Reading it should show: 4 DELETE statements, sibling-check at the end, ROLLBACK.

**If Task 3 showed non-cascading FKs into tables NOT listed above** (e.g., `trigger_runs` or `audit_log`), add corresponding DELETE statements BEFORE the routine_triggers / routines deletes. Table names may differ; use exact names from `fk-graph.txt`.

- [ ] **Step 2: Run the dry-run (ROLLBACK)**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)
psql "$DBURL" -f /root/paperclip/tmp/coma-655-delete/delete-plan.sql 2>&1 | tee /root/paperclip/tmp/coma-655-delete/dry-run-output.txt
```

Expected output:
- `pre-routines = 1, pre-triggers = 1, pre-revisions = N, pre-runs = 1` (or whatever the actual counts are)
- After deletes (still inside the txn): all `post-*` counts = 0
- `sibling-still-here` row showing the May 24 routine present
- `ROLLBACK` at the end

If post-counts are not 0, or sibling-check returns 0 rows, or anything errors, **STOP** and review the schema discovery.

---

### Task 6: Execute the deletion (GATED — requires user approval)

**Files:**
- Create: `tmp/coma-655-delete/execute-output.txt`

> **PER-ACTION APPROVAL REQUIRED before running this task. The user must explicitly approve after reviewing the dry-run output.**

- [ ] **Step 1: Wait for user approval**

Surface the dry-run output to the user and ask: "Dry-run shows X routine row, Y triggers, Z revisions, W runs would be deleted. Sibling May 24 routine intact. Proceed with COMMIT?"

If user says no — stop. The routine stays archived, which is functionally equivalent.

If user says yes, proceed.

- [ ] **Step 2: Replace ROLLBACK with COMMIT in the plan file and run**

```bash
DBURL=$(docker inspect paperclip --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | cut -d= -f2-)

# Patch the script
sed -i 's/^ROLLBACK;$/COMMIT;/' /root/paperclip/tmp/coma-655-delete/delete-plan.sql
grep -E '^(COMMIT|ROLLBACK);$' /root/paperclip/tmp/coma-655-delete/delete-plan.sql  # should print COMMIT

# Execute
psql "$DBURL" -f /root/paperclip/tmp/coma-655-delete/delete-plan.sql 2>&1 | tee /root/paperclip/tmp/coma-655-delete/execute-output.txt
```

Expected: same output as dry-run but ending with `COMMIT` instead of `ROLLBACK`. Post-counts all 0; sibling still present.

---

### Task 7: Verify deletion + server health

**Files:**
- Create: `tmp/coma-655-delete/post-verification.txt`

- [ ] **Step 1: Confirm routine is gone via the Paperclip API (not just SQL)**

```bash
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
CID=1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61

echo "=== routine via API (should 404) ===" | tee /root/paperclip/tmp/coma-655-delete/post-verification.txt
docker exec paperclip sh -c "curl -sS -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/routines/ad55fc07-6d94-4c95-8140-2334e5a285c3" \
  | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
echo | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
```

Expected: `404`.

- [ ] **Step 2: Sibling and all other Compound Engineering routines still listed**

```bash
TOKEN=$(docker exec paperclip jq -r '.credentials."http://localhost:3100".token' /paperclip/auth.json)
echo "=== compound engineering routines after deletion ===" | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
docker exec paperclip sh -c "curl -sS -H 'Authorization: Bearer $TOKEN' http://localhost:3100/api/companies/1c37c7d0-5cb3-4841-aaba-3ac3b0dd5b61/routines" \
  | jq '.[] | {title, status}' \
  | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
```

Expected: 16 routines (was 17). Sibling May 24 routine present with status active. The May 17 one is gone (not just hidden — it's not returned at all now).

- [ ] **Step 3: Server health probe + log check**

```bash
echo "=== server health ===" | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/api/health | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
echo "=== recent log errors (last 1 min) ===" | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
docker logs --since 1m paperclip 2>&1 | grep -iE 'error|fatal' | head -5 | tee -a /root/paperclip/tmp/coma-655-delete/post-verification.txt
```

Expected: 200 from health. No new errors mentioning the deleted routine ID.

---

### Task 8: Commit a record of what was done

**Files:**
- Create: `docs/superpowers/plans/2026-05-20-coma-655-may17-delete-summary.md` (mirror of `tmp/coma-655-delete/post-verification.txt` + the schema findings + counts)

- [ ] **Step 1: Write the summary doc** (paths from `tmp/coma-655-delete/` — but NOT including DATABASE_URL, NOT including backup-affected-rows.sql which contains sensitive data)

```bash
cd /root/paperclip
{
  echo "# COMA-655 May 17 Routine — Hard Delete Summary"
  echo
  echo "Date: $(date -Iseconds)"
  echo
  echo "## Deleted"
  echo "- Routine ID: \`ad55fc07-6d94-4c95-8140-2334e5a285c3\`"
  echo "- Title: COMA-655: May 17 CTR re-check for DPA pages"
  echo "- Was: \`archived\`"
  echo
  echo "## FK schema discovered"
  cat tmp/coma-655-delete/fk-graph.txt
  echo
  echo "## Counts deleted"
  grep -E '^pre-|^post-' tmp/coma-655-delete/execute-output.txt
  echo
  echo "## Post-verification"
  cat tmp/coma-655-delete/post-verification.txt
} > docs/superpowers/plans/2026-05-20-coma-655-may17-delete-summary.md
git add docs/superpowers/plans/2026-05-20-coma-655-may17-delete-summary.md
git commit -m "compound: hard-delete COMA-655 May 17 archived routine + dependencies

Removed routine row ad55fc07-... plus N triggers, M revisions, K runs
from Supabase. Sibling May 24 routine (c76cd3b3-...) untouched. Paperclip
server healthy post-deletion. See summary for FK schema and counts.

Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

Expected: clean commit; tmp/ files NOT included (they hold the DATABASE_URL and CSV dumps).

---

## Rollback (if Task 6 went wrong)

If post-verification shows unexpected damage:

1. Stop. Don't run further DELETEs.
2. Restore from the backup taken in Task 4 Step 2:

```bash
# Find the most recent backup
docker exec paperclip ls -t /paperclip/instances/default/data/backups/ | head -3
```

Restoring is `psql "$DBURL" < <backup-file>` BUT this re-imports the entire DB. Coordinate with the user before doing it.

Alternatively, the targeted CSV at `tmp/coma-655-delete/backup-affected-rows.sql` can be hand-re-inserted via crafted INSERT statements if only this routine's data needs restoration. Less risky than full restore.

---

## Why this is more complex than archiving

For comparison: archiving the same routine took one `PATCH /api/routines/{id}` call. Hard-delete:
- Has no API endpoint (intentional design choice)
- Requires direct DB access bypassing the audit/lifecycle layer
- Risks orphaning rows in dependent tables if FK schema isn't fully discovered
- Removes the audit trail of when the routine ran (the May 17 fire is gone)

If the goal was just "stop it firing" — archiving is the right tool and it's done. If the goal is data hygiene (zero zombie rows visible to maintainers querying the DB directly), this plan is the way.

The user's call. Plan provided; not executed until per-action approval at Task 6.
