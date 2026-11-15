/**
 * Procedural deadlines of matters (Greek civil procedure, lib/deadlines).
 *
 *   GET /api/v1/deadline-settings                 per matter type: rule set + default inputs
 *   PUT /api/v1/deadline-settings/:caseTypeId     { rules: 'gr_ordinary'|'gr_small_claims'|'none', defaults } (admins)
 *
 *   GET /api/v1/case-deadlines/:caseId            rule set of the matter's type, its inputs
 *                                                 (stored, else the type's defaults) and the deadlines
 *   PUT /api/v1/case-deadlines/:caseId            { filing_date, defendant_abroad, state_party,
 *                                                   summons, incidental, hearing_date? }
 *
 * Inputs live in cases.procedure_inputs; the hearing is cases.next_hearing_date
 * (shown on the calendar). Δωσιδικία (local court suspensions) is deliberately
 * not modelled - see decisions/0004-deadlines.md.
 */
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { computeDeadlines, type DeadlineRules } from '../../lib/deadlines/index.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';

export const deadlineSettingsRouter = Router();
export const caseDeadlinesRouter = Router();

const RULES = ['gr_ordinary', 'gr_small_claims'] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// app.ts strips nulls from request bodies, so '' means "no date".
const optionalDate = z.union([isoDate, z.literal('')]).optional();

const inputsSchema = z.object({
  filing_date: optionalDate,
  defendant_abroad: z.boolean().optional(),
  state_party: z.boolean().optional(),
  summons: z.boolean().optional(),
  incidental: z.boolean().optional(),
});
type Inputs = z.infer<typeof inputsSchema>;

const EMPTY_DEFAULTS: Inputs = { defendant_abroad: false, state_party: false, summons: false, incidental: false };

// ── Settings per matter type ────────────────────────────────────────────────

deadlineSettingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    const [rows, canManage] = await Promise.all([
      db.query(
        `select case_type_id, rules, defaults from public.case_type_deadline_settings where organization_id = $1`,
        [org]
      ),
      isOrgAdminOrSoleMember(userId, org),
    ]);
    res.status(200).json({ settings: rows.rows, can_manage: canManage });
  })
);

deadlineSettingsRouter.put(
  '/:caseTypeId',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    if (!(await isOrgAdminOrSoleMember(userId, org))) {
      throw new ApiError('Only firm administrators can change deadline settings', 403, 'FORBIDDEN');
    }
    const { caseTypeId } = z.object({ caseTypeId: z.string().uuid() }).parse(req.params);
    const body = z
      .object({ rules: z.enum([...RULES, 'none']), defaults: inputsSchema.omit({ filing_date: true }).default({}) })
      .parse(req.body);
    const type = await db.query(
      'select id from public.case_types where id = $1 and (organization_id = $2 or organization_id is null)',
      [caseTypeId, org]
    );
    if (!type.rows[0]) throw new ApiError('Matter type not found', 404, 'NOT_FOUND');

    if (body.rules === 'none') {
      await db.query(
        'delete from public.case_type_deadline_settings where organization_id = $1 and case_type_id = $2',
        [org, caseTypeId]
      );
      res.status(200).json({ case_type_id: caseTypeId, rules: null, defaults: {} });
      return;
    }
    const r = await db.query(
      `insert into public.case_type_deadline_settings (organization_id, case_type_id, rules, defaults, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (organization_id, case_type_id) do update
         set rules = excluded.rules, defaults = excluded.defaults, updated_at = now()
       returning case_type_id, rules, defaults`,
      [org, caseTypeId, body.rules, JSON.stringify({ ...EMPTY_DEFAULTS, ...body.defaults })]
    );
    res.status(200).json(r.rows[0]);
  })
);

// ── Deadlines of a matter ───────────────────────────────────────────────────

interface CaseInfo {
  rules: DeadlineRules | null;
  defaults: Inputs | null;
  procedure_inputs: Inputs | null;
  hearing_date: string | null;
}

async function loadCase(org: string, caseId: string): Promise<CaseInfo> {
  const r = await db.query<CaseInfo>(
    `select s.rules, s.defaults, c.procedure_inputs,
            to_char(c.next_hearing_date at time zone $3, 'YYYY-MM-DD') as hearing_date
       from public.cases c
       left join public.case_type_deadline_settings s
              on s.organization_id = c.organization_id and s.case_type_id = c.case_type_id
      where c.id = $1 and c.organization_id = $2`,
    [caseId, org, env.REMINDER_TIMEZONE]
  );
  if (!r.rows[0]) throw new ApiError('Case not found', 404, 'NOT_FOUND');
  return r.rows[0];
}

function describe(info: CaseInfo) {
  if (!info.rules) return { rules: null };
  const inputs: Inputs = { ...EMPTY_DEFAULTS, ...(info.defaults ?? {}), ...(info.procedure_inputs ?? {}) };
  const base = {
    rules: info.rules,
    inputs,
    defaults: { ...EMPTY_DEFAULTS, ...(info.defaults ?? {}) },
    stored: !!info.procedure_inputs,
    hearing_date: info.hearing_date,
  };
  if (!inputs.filing_date) return { ...base, missing: ['filing_date'], deadlines: [] };
  const result = computeDeadlines(info.rules, {
    filingDate: inputs.filing_date,
    defendantAbroad: !!inputs.defendant_abroad,
    stateParty: !!inputs.state_party,
    summons: !!inputs.summons,
    incidental: !!inputs.incidental,
    hearingDate: info.hearing_date,
  });
  return { ...base, ...result };
}

caseDeadlinesRouter.get(
  '/:caseId',
  asyncHandler(async (req, res) => {
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(req.params);
    res.status(200).json(describe(await loadCase(req.auth!.organizationId, caseId)));
  })
);

caseDeadlinesRouter.put(
  '/:caseId',
  asyncHandler(async (req, res) => {
    const org = req.auth!.organizationId;
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(req.params);
    const body = inputsSchema.extend({ hearing_date: optionalDate }).parse(req.body);
    const { hearing_date, ...rest } = body;
    const inputs = { ...rest, filing_date: rest.filing_date || null };
    await loadCase(org, caseId); // 404 for other firms' matters
    await db.query(
      `update public.cases
          set procedure_inputs = $3::jsonb,
              next_hearing_date = case when $4 then $5::date::timestamp at time zone $6 else next_hearing_date end,
              updated_at = now()
        where id = $1 and organization_id = $2`,
      [caseId, org, JSON.stringify(inputs), hearing_date !== undefined, hearing_date || null, env.REMINDER_TIMEZONE]
    );
    res.status(200).json(describe(await loadCase(org, caseId)));
  })
);
