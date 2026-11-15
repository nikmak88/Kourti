# 0001 — Repair the database schema at boot (schemaCompletion.ts)

**Status:** accepted (2026-11-15) · **Code:** `backend-node/src/db/schemaCompletion.ts`, commit 009265b

## Context
Upstream ran on Supabase; its full schema lived in `supabase/migrations`, deleted in
upstream commit `f093706` (2026-05-02). The replacement bootstrap (`db/bootstrap.ts`,
`docker/postgres/init`) rebuilds only part of it, so every fresh install had missing
tables/columns/functions (clients, invoices, document search, matter activity,
Disable User, change role…), often hidden behind `.catch(() => ({ rows: [] }))`.

## Decision
Keep upstream's bootstrap untouched and append `schemaCompletionStatements`, derived by
replaying the deleted migrations into a scratch pgvector Postgres and diffing against a
fresh install, restricted to what the backend code reads/writes. Rules:
- **Additive only** (`create … if not exists`, `add column if not exists`, all nullable).
- Supabase-only parts dropped (RLS, `auth.users` FKs, `auth.uid()`); the six SQL
  functions were rewritten without `auth.uid()` because Node checks permissions first.
- Constraint re-adds wrapped in `do $c$ … exception when duplicate_object …` (no log noise).
- Postgres image = `postgres:16-alpine` + pgvector built in `deploy/postgres/` (same libc
  as before, so existing volumes need no reindex).

## Consequences
New upstream code may reference more missing schema; re-run the audit (see
`learnings/verification.md`) after merging upstream.
