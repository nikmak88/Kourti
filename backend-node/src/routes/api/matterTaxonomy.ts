/**
 * Matter types & issues management for a firm (Settings → Matter types).
 *
 *   GET    /api/v1/matter-taxonomy                     full tree incl. removed items
 *   POST   /api/v1/matter-taxonomy/types               { name, description? }
 *   PATCH  /api/v1/matter-taxonomy/types/:id           { name?, description? }  (firm's own)
 *   DELETE /api/v1/matter-taxonomy/types/:id
 *   POST   /api/v1/matter-taxonomy/types/:id/restore
 *   POST   /api/v1/matter-taxonomy/issues              { case_type_id, name, description? }
 *   PATCH  /api/v1/matter-taxonomy/issues/:id          { name?, description? }  (firm's own)
 *   DELETE /api/v1/matter-taxonomy/issues/:id
 *   POST   /api/v1/matter-taxonomy/issues/:id/restore
 *   POST   /api/v1/matter-taxonomy/remove-defaults     hide every default type
 *   POST   /api/v1/matter-taxonomy/import              { rows: [{type, issue?, ...}], replace }
 *
 * "Remove" never loses data:
 *   - default (global) items are HIDDEN for this firm (organization_taxonomy_hidden);
 *     they stay in the database, so the boot-time seed does not re-add them;
 *   - the firm's own items are DELETED when no matter uses them, otherwise
 *     RETIRED (is_active = false).
 * Hidden/retired items disappear from the New Matter form; existing matters
 * keep showing them, and they can be restored. All writes need a firm admin.
 */
import { Router } from 'express';
import type { QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';

export const matterTaxonomyRouter = Router();

/** Anything with pg's query(): the pool or a transaction client. */
interface Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}
type Removal = 'hidden' | 'deleted' | 'retired';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(1000).optional();

async function requireAdmin(userId: string, organizationId: string) {
  if (!(await isOrgAdminOrSoleMember(userId, organizationId))) {
    throw new ApiError('Only firm administrators can manage matter types', 403, 'FORBIDDEN');
  }
}

// ── Lookups ─────────────────────────────────────────────────────────────────

interface TypeRow {
  id: string;
  name: string;
  description: string | null;
  is_global: boolean;
  is_active: boolean;
  organization_id: string | null;
  hidden: boolean;
  matter_count: number;
}
interface IssueRow {
  id: string;
  case_type_id: string;
  name: string;
  description: string | null;
  is_global: boolean;
  is_active: boolean;
  organization_id: string | null;
  hidden: boolean;
  matter_count: number;
}

async function loadTypes(q: Q, org: string): Promise<TypeRow[]> {
  const r = await q.query<TypeRow>(
    `select ct.id, ct.name, ct.description, coalesce(ct.is_global, false) as is_global,
            coalesce(ct.is_active, true) as is_active, ct.organization_id,
            exists (select 1 from public.organization_taxonomy_hidden h
                     where h.organization_id = $1 and h.item_type = 'type' and h.item_id = ct.id) as hidden,
            (select count(*)::int from public.cases c where c.case_type_id = ct.id and c.organization_id = $1) as matter_count
       from public.case_types ct
      where ct.organization_id = $1 or ct.is_global = true
      order by lower(ct.name)`,
    [org]
  );
  return r.rows;
}

async function loadIssues(q: Q, org: string, typeIds: string[]): Promise<IssueRow[]> {
  if (!typeIds.length) return [];
  const r = await q.query<IssueRow>(
    `select ci.id, ci.case_type_id, ci.name, ci.description,
            (ci.organization_id is null) as is_global,
            coalesce(ci.is_active, true) as is_active, ci.organization_id,
            exists (select 1 from public.organization_taxonomy_hidden h
                     where h.organization_id = $1 and h.item_type = 'issue' and h.item_id = ci.id) as hidden,
            (select count(*)::int from public.cases c where c.case_issue_id = ci.id and c.organization_id = $1) as matter_count
       from public.case_issues ci
      where ci.case_type_id = any($2::uuid[])
        and (ci.organization_id is null or ci.organization_id = $1)
      order by (lower(ci.name) = 'other'), lower(ci.name)`,
    [org, typeIds]
  );
  return r.rows;
}

async function getType(q: Q, org: string, id: string): Promise<TypeRow> {
  const t = (await loadTypes(q, org)).find((x) => x.id === id);
  if (!t) throw new ApiError('Matter type not found', 404, 'NOT_FOUND');
  return t;
}

async function getIssue(q: Q, org: string, id: string): Promise<IssueRow> {
  const r = await q.query<{ case_type_id: string }>(
    `select case_type_id from public.case_issues where id = $1`,
    [id]
  );
  const typeId = r.rows[0]?.case_type_id;
  if (!typeId) throw new ApiError('Matter issue not found', 404, 'NOT_FOUND');
  await getType(q, org, typeId); // type must be visible to this firm
  const issue = (await loadIssues(q, org, [typeId])).find((x) => x.id === id);
  if (!issue) throw new ApiError('Matter issue not found', 404, 'NOT_FOUND');
  return issue;
}

const isRemoved = (x: { hidden: boolean; is_active: boolean }) => x.hidden || !x.is_active;
const isOwn = (x: { organization_id: string | null }, org: string) => x.organization_id === org;

// ── Remove / restore primitives ─────────────────────────────────────────────

async function removeIssue(q: Q, org: string, user: string, i: IssueRow): Promise<Removal> {
  if (!isOwn(i, org)) {
    await q.query(
      `insert into public.organization_taxonomy_hidden (organization_id, item_type, item_id, created_by)
       values ($1, 'issue', $2, $3) on conflict do nothing`,
      [org, i.id, user]
    );
    return 'hidden';
  }
  if (i.matter_count === 0) {
    await q.query(`delete from public.case_issues where id = $1 and organization_id = $2`, [i.id, org]);
    return 'deleted';
  }
  await q.query(`update public.case_issues set is_active = false, updated_at = now() where id = $1`, [i.id]);
  return 'retired';
}

async function removeType(q: Q, org: string, user: string, t: TypeRow): Promise<Removal> {
  if (!isOwn(t, org)) {
    await q.query(
      `insert into public.organization_taxonomy_hidden (organization_id, item_type, item_id, created_by)
       values ($1, 'type', $2, $3) on conflict do nothing`,
      [org, t.id, user]
    );
    return 'hidden';
  }
  const issues = await loadIssues(q, org, [t.id]);
  const issuesInUse = issues.some((i) => i.matter_count > 0);
  if (t.matter_count === 0 && !issuesInUse) {
    await q.query(`delete from public.case_fields where case_type_id = $1 and organization_id = $2`, [t.id, org]);
    await q.query(`delete from public.case_issues where case_type_id = $1`, [t.id]);
    await q.query(`delete from public.case_types where id = $1 and organization_id = $2`, [t.id, org]);
    return 'deleted';
  }
  await q.query(`update public.case_types set is_active = false, updated_at = now() where id = $1`, [t.id]);
  return 'retired';
}

async function restoreType(q: Q, org: string, t: TypeRow) {
  await q.query(
    `delete from public.organization_taxonomy_hidden where organization_id = $1 and item_type = 'type' and item_id = $2`,
    [org, t.id]
  );
  if (isOwn(t, org)) {
    await q.query(`update public.case_types set is_active = true, updated_at = now() where id = $1`, [t.id]);
  }
}

async function restoreIssue(q: Q, org: string, i: IssueRow) {
  await q.query(
    `delete from public.organization_taxonomy_hidden where organization_id = $1 and item_type = 'issue' and item_id = $2`,
    [org, i.id]
  );
  if (isOwn(i, org)) {
    await q.query(`update public.case_issues set is_active = true, updated_at = now() where id = $1`, [i.id]);
  }
}

function assertNoActiveDuplicate(
  items: Array<{ id: string; name: string; hidden: boolean; is_active: boolean }>,
  newName: string,
  exceptId?: string,
  what = 'A matter type'
) {
  const clash = items.find(
    (x) => x.id !== exceptId && !isRemoved(x) && x.name.trim().toLowerCase() === newName.trim().toLowerCase()
  );
  if (clash) throw new ApiError(`${what} named "${clash.name}" already exists`, 409, 'DUPLICATE');
}

// ── Routes ──────────────────────────────────────────────────────────────────

matterTaxonomyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const org = req.auth!.organizationId;
    const types = await loadTypes(db, org);
    const issues = await loadIssues(db, org, types.map((t) => t.id));
    res.status(200).json({
      types: types.map((t) => ({
        ...t,
        removed: isRemoved(t),
        issues: issues.filter((i) => i.case_type_id === t.id).map((i) => ({ ...i, removed: isRemoved(i) })),
      })),
      can_manage: await isOrgAdminOrSoleMember(req.auth!.userId, org),
    });
  })
);

matterTaxonomyRouter.post(
  '/types',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = z.object({ name, description }).parse(req.body);
    const types = await loadTypes(db, org);
    assertNoActiveDuplicate(types, body.name);
    // Re-adding a removed type restores it instead of creating a duplicate.
    const removed = types.find((t) => isRemoved(t) && t.name.trim().toLowerCase() === body.name.toLowerCase());
    if (removed) {
      await restoreType(db, org, removed);
      res.status(200).json({ id: removed.id, restored: true });
      return;
    }
    const r = await db.query<{ id: string }>(
      `insert into public.case_types (name, description, is_active, is_global, organization_id, created_by)
       values ($1, $2, true, false, $3, $4) returning id`,
      [body.name, body.description || null, org, userId]
    );
    res.status(201).json({ id: r.rows[0].id, restored: false });
  })
);

matterTaxonomyRouter.patch(
  '/types/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const id = uuid.parse(req.params.id);
    const body = z.object({ name: name.optional(), description }).parse(req.body);
    const types = await loadTypes(db, org);
    const t = types.find((x) => x.id === id);
    if (!t) throw new ApiError('Matter type not found', 404, 'NOT_FOUND');
    if (!isOwn(t, org)) {
      throw new ApiError(
        'Default matter types cannot be renamed. Remove it and add your own type instead.',
        400,
        'DEFAULT_READ_ONLY'
      );
    }
    if (body.name) assertNoActiveDuplicate(types, body.name, id);
    await db.query(
      `update public.case_types set name = coalesce($2, name), description = coalesce($3, description), updated_at = now()
        where id = $1 and organization_id = $4`,
      [id, body.name ?? null, body.description ?? null, org]
    );
    res.status(200).json({ ok: true });
  })
);

matterTaxonomyRouter.delete(
  '/types/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const t = await getType(db, org, uuid.parse(req.params.id));
    res.status(200).json({ result: await removeType(db, org, userId, t), matter_count: t.matter_count });
  })
);

matterTaxonomyRouter.post(
  '/types/:id/restore',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const t = await getType(db, org, uuid.parse(req.params.id));
    assertNoActiveDuplicate(await loadTypes(db, org), t.name, t.id);
    await restoreType(db, org, t);
    res.status(200).json({ ok: true });
  })
);

matterTaxonomyRouter.post(
  '/issues',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = z.object({ case_type_id: uuid, name, description }).parse(req.body);
    const t = await getType(db, org, body.case_type_id);
    const issues = await loadIssues(db, org, [t.id]);
    assertNoActiveDuplicate(issues, body.name, undefined, 'An issue');
    const removed = issues.find((i) => isRemoved(i) && i.name.trim().toLowerCase() === body.name.toLowerCase());
    if (removed) {
      await restoreIssue(db, org, removed);
      res.status(200).json({ id: removed.id, restored: true });
      return;
    }
    const r = await db.query<{ id: string }>(
      `insert into public.case_issues (case_type_id, organization_id, name, description, is_global)
       values ($1, $2, $3, $4, false) returning id`,
      [t.id, org, body.name, body.description || null]
    );
    res.status(201).json({ id: r.rows[0].id, restored: false });
  })
);

matterTaxonomyRouter.patch(
  '/issues/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = z.object({ name: name.optional(), description }).parse(req.body);
    const i = await getIssue(db, org, uuid.parse(req.params.id));
    if (!isOwn(i, org)) {
      throw new ApiError(
        'Default issues cannot be renamed. Remove it and add your own issue instead.',
        400,
        'DEFAULT_READ_ONLY'
      );
    }
    if (body.name) assertNoActiveDuplicate(await loadIssues(db, org, [i.case_type_id]), body.name, i.id, 'An issue');
    await db.query(
      `update public.case_issues set name = coalesce($2, name), description = coalesce($3, description), updated_at = now()
        where id = $1 and organization_id = $4`,
      [i.id, body.name ?? null, body.description ?? null, org]
    );
    res.status(200).json({ ok: true });
  })
);

matterTaxonomyRouter.delete(
  '/issues/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const i = await getIssue(db, org, uuid.parse(req.params.id));
    res.status(200).json({ result: await removeIssue(db, org, userId, i), matter_count: i.matter_count });
  })
);

matterTaxonomyRouter.post(
  '/issues/:id/restore',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const i = await getIssue(db, org, uuid.parse(req.params.id));
    assertNoActiveDuplicate(await loadIssues(db, org, [i.case_type_id]), i.name, i.id, 'An issue');
    await restoreIssue(db, org, i);
    res.status(200).json({ ok: true });
  })
);

matterTaxonomyRouter.post(
  '/remove-defaults',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const r = await db.query(
      `insert into public.organization_taxonomy_hidden (organization_id, item_type, item_id, created_by)
       select $1, 'type', ct.id, $2 from public.case_types ct where ct.is_global = true
       on conflict do nothing`,
      [org, userId]
    );
    res.status(200).json({ hidden: r.rowCount ?? 0 });
  })
);

// ── CSV import (rows parsed in the browser) ────────────────────────────────

const importSchema = z.object({
  replace: z.boolean().default(false),
  rows: z
    .array(
      z.object({
        type: name,
        issue: z.string().trim().max(200).optional().default(''),
        type_description: description,
        issue_description: description,
        // Optional 5th CSV column: procedural deadline rules for the type (lib/deadlines).
        deadline_rules: z.enum(['gr_ordinary', 'gr_small_claims']).optional().catch(undefined),
      })
    )
    .min(1)
    .max(5000),
});

matterTaxonomyRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = importSchema.parse(req.body);
    const stats = await importTaxonomy(org, userId, body);
    res.status(200).json({ ok: true, ...stats });
  })
);

export type TaxonomyImport = z.input<typeof importSchema>;

/**
 * Merge rows into a firm's matter types/issues (matching names case-
 * insensitively, restoring removed items); with `replace`, remove every active
 * type/issue that is not in the rows. One transaction. Also used by
 * `kourtictl matter-types import` (scripts/importMatterTypes.ts).
 */
export async function importTaxonomy(org: string, userId: string, input: TaxonomyImport) {
  const body = importSchema.parse(input);

  // Group rows by type (case-insensitive), keeping the first spelling.
  const wanted = new Map<string, { name: string; description?: string; deadlineRules?: string; issues: Map<string, { name: string; description?: string }> }>();
  for (const row of body.rows) {
    const key = row.type.toLowerCase();
    if (!wanted.has(key)) wanted.set(key, { name: row.type, description: row.type_description, issues: new Map() });
    if (row.deadline_rules) wanted.get(key)!.deadlineRules = row.deadline_rules;
    const entry = wanted.get(key)!;
    if (!entry.description && row.type_description) entry.description = row.type_description;
    if (row.issue && !entry.issues.has(row.issue.toLowerCase())) {
      entry.issues.set(row.issue.toLowerCase(), { name: row.issue, description: row.issue_description });
    }
  }

  const stats = {
    types_created: 0,
    types_restored: 0,
    types_kept: 0,
    issues_created: 0,
    issues_restored: 0,
    issues_kept: 0,
    types_removed: 0,
    issues_removed: 0,
  };

  const client = await db.connect();
  try {
    await client.query('begin');
    const types = await loadTypes(client, org);
    const keptTypeIds = new Set<string>();

    for (const [key, w] of wanted) {
      // Prefer an active match, then the firm's own, then a default.
      const candidates = types.filter((t) => t.name.trim().toLowerCase() === key);
      const match =
        candidates.find((t) => !isRemoved(t)) ??
        candidates.find((t) => isOwn(t, org)) ??
        candidates[0];
      let typeId: string;
      if (match) {
        typeId = match.id;
        if (isRemoved(match)) {
          await restoreType(client, org, match);
          stats.types_restored++;
        } else {
          stats.types_kept++;
        }
      } else {
        const r = await client.query<{ id: string }>(
          `insert into public.case_types (name, description, is_active, is_global, organization_id, created_by)
           values ($1, $2, true, false, $3, $4) returning id`,
          [w.name, w.description || null, org, userId]
        );
        typeId = r.rows[0].id;
        stats.types_created++;
      }
      keptTypeIds.add(typeId);
      if (w.deadlineRules) {
        await client.query(
          `insert into public.case_type_deadline_settings (organization_id, case_type_id, rules, defaults)
           values ($1, $2, $3, '{"defendant_abroad":false,"state_party":false,"summons":false,"incidental":false}'::jsonb)
           on conflict (organization_id, case_type_id) do update set rules = excluded.rules, updated_at = now()`,
          [org, typeId, w.deadlineRules]
        );
      }

      const issues = await loadIssues(client, org, [typeId]);
      const keptIssueIds = new Set<string>();
      for (const [ikey, wi] of w.issues) {
        const ic = issues.filter((i) => i.name.trim().toLowerCase() === ikey);
        const im = ic.find((i) => !isRemoved(i)) ?? ic.find((i) => isOwn(i, org)) ?? ic[0];
        if (im) {
          keptIssueIds.add(im.id);
          if (isRemoved(im)) {
            await restoreIssue(client, org, im);
            stats.issues_restored++;
          } else {
            stats.issues_kept++;
          }
        } else {
          const r = await client.query<{ id: string }>(
            `insert into public.case_issues (case_type_id, organization_id, name, description, is_global)
             values ($1, $2, $3, $4, false) returning id`,
            [typeId, org, wi.name, wi.description || null]
          );
          keptIssueIds.add(r.rows[0].id);
          stats.issues_created++;
        }
      }
      if (body.replace) {
        for (const i of issues) {
          if (!keptIssueIds.has(i.id) && !isRemoved(i)) {
            await removeIssue(client, org, userId, i);
            stats.issues_removed++;
          }
        }
      }
    }

    if (body.replace) {
      for (const t of types) {
        if (!keptTypeIds.has(t.id) && !isRemoved(t)) {
          await removeType(client, org, userId, t);
          stats.types_removed++;
        }
      }
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  return stats;
}
