/**
 * Contract types for a firm (Settings → Contract types, and the contract-type
 * pickers on the contract screens). Same model as matter types
 * (routes/api/matterTaxonomy.ts), but a flat list.
 *
 *   GET    /api/v1/contract-types                 all types incl. removed + can_manage
 *   POST   /api/v1/contract-types                 { name, description? }
 *   PATCH  /api/v1/contract-types/:id             { name?, description? }  (firm's own)
 *   DELETE /api/v1/contract-types/:id
 *   POST   /api/v1/contract-types/:id/restore
 *   POST   /api/v1/contract-types/remove-defaults hide every default
 *   POST   /api/v1/contract-types/import          { rows: [{name, description?}], replace }
 *
 * contracts.contract_type stores the type's NAME (text), as it did before this
 * table existed; built-in defaults keep their English name there and are
 * translated only for display (common:contractTypes.<key>).
 * "Remove" never loses data: defaults are HIDDEN for this firm
 * (organization_taxonomy_hidden, item_type 'contract_type'); the firm's own
 * types are DELETED when no contract uses them, otherwise RETIRED. Renaming an
 * own type renames it on the firm's contracts too. Writes need a firm admin.
 */
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';

export const contractTypesRouter = Router();

const HIDDEN = 'contract_type';
const name = z.string().trim().min(1).max(200);
const description = z.string().trim().max(1000).optional();
const idParams = z.object({ id: z.string().uuid() });

async function requireAdmin(userId: string, organizationId: string) {
  if (!(await isOrgAdminOrSoleMember(userId, organizationId))) {
    throw new ApiError('Only firm administrators can manage contract types', 403, 'FORBIDDEN');
  }
}

interface TypeRow {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  removed: boolean;
  contract_count: number;
}

type Queryable = Pick<PoolClient, 'query'>;

/** Defaults + the firm's own types, with removed flag and usage count. */
async function loadTypes(q: Queryable, org: string): Promise<TypeRow[]> {
  const r = await q.query<TypeRow>(
    `select ct.id, ct.key, ct.name, ct.description,
            (ct.organization_id is null) as is_default,
            case when ct.organization_id is null then h.item_id is not null
                 else not ct.is_active end as removed,
            coalesce(u.n, 0)::int as contract_count
       from public.contract_types ct
       left join public.organization_taxonomy_hidden h
              on h.organization_id = $1 and h.item_type = '${HIDDEN}' and h.item_id = ct.id
       left join (select lower(contract_type) as name, count(*) as n
                    from public.contracts where organization_id = $1 and contract_type is not null
                   group by 1) u on u.name = lower(ct.name)
      where ct.organization_id is null or ct.organization_id = $1
      order by (ct.organization_id is not null), ct.sort_order, lower(ct.name)`,
    [org]
  );
  return r.rows;
}

async function getType(q: Queryable, org: string, id: string): Promise<TypeRow> {
  const row = (await loadTypes(q, org)).find((t) => t.id === id);
  if (!row) throw new ApiError('Contract type not found', 404, 'NOT_FOUND');
  return row;
}

async function removeType(q: Queryable, org: string, userId: string, t: TypeRow) {
  if (t.is_default) {
    await q.query(
      `insert into public.organization_taxonomy_hidden (organization_id, item_type, item_id, created_by)
       values ($1, '${HIDDEN}', $2, $3) on conflict do nothing`,
      [org, t.id, userId]
    );
    return 'hidden';
  }
  if (t.contract_count > 0) {
    await q.query(
      'update public.contract_types set is_active = false, updated_at = now() where id = $1 and organization_id = $2',
      [t.id, org]
    );
    return 'retired';
  }
  await q.query('delete from public.contract_types where id = $1 and organization_id = $2', [t.id, org]);
  return 'deleted';
}

async function restoreType(q: Queryable, org: string, t: TypeRow) {
  if (t.is_default) {
    await q.query(
      `delete from public.organization_taxonomy_hidden
        where organization_id = $1 and item_type = '${HIDDEN}' and item_id = $2`,
      [org, t.id]
    );
  } else {
    await q.query(
      'update public.contract_types set is_active = true, updated_at = now() where id = $1 and organization_id = $2',
      [t.id, org]
    );
  }
}

/** Find by name (case-insensitive), preferring an active one, then the firm's own. */
function findByName(types: TypeRow[], value: string): TypeRow | undefined {
  const c = types.filter((t) => t.name.trim().toLowerCase() === value.trim().toLowerCase());
  return c.find((t) => !t.removed) ?? c.find((t) => !t.is_default) ?? c[0];
}

async function insertOwn(q: Queryable, org: string, userId: string, n: string, d?: string) {
  const r = await q.query<{ id: string }>(
    `insert into public.contract_types (organization_id, name, description, created_by)
     values ($1, $2, $3, $4) returning id`,
    [org, n, d || null, userId]
  );
  return r.rows[0].id;
}

contractTypesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    const [types, canManage] = await Promise.all([
      loadTypes(db, org),
      isOrgAdminOrSoleMember(userId, org),
    ]);
    res.status(200).json({ types, can_manage: canManage });
  })
);

contractTypesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = z.object({ name, description }).parse(req.body);
    const existing = findByName(await loadTypes(db, org), body.name);
    if (existing && !existing.removed) {
      throw new ApiError(`"${existing.name}" already exists`, 409, 'CONFLICT');
    }
    if (existing) {
      await restoreType(db, org, existing);
      res.status(200).json({ id: existing.id, restored: true });
      return;
    }
    const id = await insertOwn(db, org, userId, body.name, body.description);
    res.status(201).json({ id, restored: false });
  })
);

contractTypesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const { id } = idParams.parse(req.params);
    const body = z.object({ name: name.optional(), description }).parse(req.body);

    const client = await db.connect();
    try {
      await client.query('begin');
      const t = await getType(client, org, id);
      if (t.is_default) {
        throw new ApiError('Built-in contract types cannot be renamed; add your own instead', 400, 'VALIDATION_ERROR');
      }
      if (body.name && body.name.toLowerCase() !== t.name.toLowerCase()) {
        const clash = findByName(await loadTypes(client, org), body.name);
        if (clash && clash.id !== id) {
          throw new ApiError(`"${clash.name}" already exists`, 409, 'CONFLICT');
        }
      }
      await client.query(
        `update public.contract_types
            set name = coalesce($3, name), description = coalesce($4, description), updated_at = now()
          where id = $1 and organization_id = $2`,
        [id, org, body.name ?? null, body.description ?? null]
      );
      // Contracts store the name: keep them on the renamed type.
      if (body.name && body.name !== t.name) {
        await client.query(
          `update public.contracts set contract_type = $3
            where organization_id = $1 and lower(contract_type) = lower($2)`,
          [org, t.name, body.name]
        );
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    res.status(200).json({ ok: true });
  })
);

contractTypesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const { id } = idParams.parse(req.params);
    const t = await getType(db, org, id);
    const result = t.removed ? 'unchanged' : await removeType(db, org, userId, t);
    res.status(200).json({ result, contract_count: t.contract_count });
  })
);

contractTypesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const { id } = idParams.parse(req.params);
    await restoreType(db, org, await getType(db, org, id));
    res.status(200).json({ ok: true });
  })
);

contractTypesRouter.post(
  '/remove-defaults',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const r = await db.query(
      `insert into public.organization_taxonomy_hidden (organization_id, item_type, item_id, created_by)
       select $1, '${HIDDEN}', id, $2 from public.contract_types where organization_id is null
       on conflict do nothing`,
      [org, userId]
    );
    res.status(200).json({ hidden: r.rowCount ?? 0 });
  })
);

const importSchema = z.object({
  replace: z.boolean().default(false),
  rows: z.array(z.object({ name, description })).min(1).max(2000),
});

contractTypesRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    await requireAdmin(userId, org);
    const body = importSchema.parse(req.body);
    const stats = { created: 0, restored: 0, kept: 0, removed: 0 };

    const client = await db.connect();
    try {
      await client.query('begin');
      const types = await loadTypes(client, org);
      const kept = new Set<string>();
      const seen = new Set<string>();
      for (const row of body.rows) {
        const k = row.name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const match = findByName(types, row.name);
        if (match) {
          kept.add(match.id);
          if (match.removed) {
            await restoreType(client, org, match);
            stats.restored++;
          } else {
            stats.kept++;
          }
        } else {
          kept.add(await insertOwn(client, org, userId, row.name, row.description));
          stats.created++;
        }
      }
      if (body.replace) {
        for (const t of types) {
          if (!kept.has(t.id) && !t.removed) {
            await removeType(client, org, userId, t);
            stats.removed++;
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
    res.status(200).json({ ok: true, ...stats });
  })
);
