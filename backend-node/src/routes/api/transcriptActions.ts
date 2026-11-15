/**
 * Transcript → proposed tasks and calendar events.
 *
 * POST /api/v1/ai/transcript-actions
 *   { transcript, case_id?, reference_date?, timezone? }
 *
 * The chat model reads a voice-note transcript (e.g. "Dupont divorce: file the
 * appeal brief by 1 December, Marie drafts it by Friday, hearing on the 12th
 * at 10") and returns PROPOSALS only: tasks, calendar events and the matter it
 * most likely concerns, chosen from the firm's own open matters. Nothing is
 * written here; the user reviews/edits the proposals in the Voice page and
 * creates the ones they keep through the normal /tasks and /calendar APIs.
 *
 * Relative dates ("next Friday", "in two weeks") are resolved against
 * reference_date (the recording day, from the browser) so they are correct
 * even when processed later. Every returned id (matter, assignee) is checked
 * against this firm's data before it is sent back.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';
import { runWithTools, type ToolDef } from '../../lib/tools.js';

export const transcriptActionsRouter = Router();

// Same list as the web app (src/lib/taskTypes.ts); reminder defaults are per type.
const TASK_TYPES = [
  'general', 'court_appearance', 'client_visit', 'document_review', 'research', 'filing',
  'deposition', 'meeting', 'phone_call', 'investigation', 'negotiation', 'contract_draft',
];

const EVENT_TYPES = ['meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation'] as const;
const MAX_ITEMS = 25;
const MAX_MATTERS = 200;

const bodySchema = z.object({
  transcript: z.string().trim().min(1).max(100_000),
  case_id: z.string().uuid().nullish(),
  reference_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  timezone: z.string().max(64).optional(),
});

const proposeTool: ToolDef = {
  name: 'propose_actions',
  description:
    'Return the tasks and calendar events stated or clearly implied in the transcript, and the matter it concerns.',
  parameters: {
    type: 'object',
    properties: {
      matter_id: {
        type: ['string', 'null'],
        description:
          'id of the matter from the provided list that the transcript is about, or null if none clearly matches',
      },
      matter_reason: {
        type: 'string',
        description: 'Short reason for the matter choice (names, parties or subject that matched)',
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Imperative, short: "Draft appeal brief"' },
            description: { type: 'string' },
            due_date: {
              type: ['string', 'null'],
              description: 'YYYY-MM-DD, resolved from the reference date; null if no date is given',
            },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            task_type: {
              type: 'string',
              enum: TASK_TYPES,
              description:
                'filing = filing a document with the court (pleadings, κατάθεση προτάσεων/δικογράφου); deposition = κατάθεση / testimony; court_appearance; client_visit; document_review; research; meeting; phone_call; investigation; negotiation; contract_draft; general otherwise',
            },
            assignee_user_id: {
              type: ['string', 'null'],
              description: 'id from the staff list when a person is named as responsible, else null',
            },
            source_quote: {
              type: 'string',
              description: 'The exact words in the transcript this task comes from',
            },
          },
          required: ['title', 'due_date', 'priority', 'task_type', 'assignee_user_id', 'source_quote'],
        },
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'e.g. "Hearing – Dupont v. Martin"' },
            description: { type: 'string' },
            event_type: { type: 'string', enum: [...EVENT_TYPES] },
            start: {
              type: 'string',
              description:
                'Local date-time YYYY-MM-DDTHH:MM, or YYYY-MM-DD when no time is given (all-day)',
            },
            end: {
              type: ['string', 'null'],
              description: 'Local date-time YYYY-MM-DDTHH:MM, or null (default one hour)',
            },
            location: { type: ['string', 'null'] },
            source_quote: { type: 'string' },
          },
          required: ['title', 'event_type', 'start', 'end', 'location', 'source_quote'],
        },
      },
    },
    required: ['matter_id', 'matter_reason', 'tasks', 'events'],
  },
};

type MatterRow = {
  id: string;
  title: string;
  case_number: string | null;
  status: string | null;
  client_name: string | null;
  type_name: string | null;
  issue_name: string | null;
};

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isDateTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

transcriptActionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = bodySchema.parse(req.body);

    const limit = checkRateLimit(`${auth.userId}:transcript-actions`, 10, 60_000);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const [mattersRes, staffRes] = await Promise.all([
      db.query<MatterRow>(
        `select c.id, c.title, c.case_number, c.status,
                cl.name as client_name, ct.name as type_name, ci.name as issue_name
           from public.cases c
           left join public.clients cl on cl.id = c.client_id
           left join public.case_types ct on ct.id = c.case_type_id
           left join public.case_issues ci on ci.id = c.case_issue_id
          where c.organization_id = $1
            and (coalesce(lower(c.status), '') not in ('closed', 'archived') or c.id = $2::uuid)
          order by (c.id = $2::uuid) desc nulls last, c.updated_at desc nulls last
          limit ${MAX_MATTERS}`,
        [auth.organizationId, body.case_id ?? null]
      ),
      db.query<{ user_id: string; name: string }>(
        `select p.user_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as name
           from public.profiles p
          where p.organization_id = $1 and coalesce(p.status, 'active') = 'active'
          order by p.first_name nulls last`,
        [auth.organizationId]
      ),
    ]);
    const matters = mattersRes.rows;
    const staff = staffRes.rows.filter((s) => s.name);
    const speakerName = staff.find((s) => s.user_id === auth.userId)?.name ?? '';

    const refDate = body.reference_date ?? new Date().toISOString().slice(0, 10);
    const weekday = new Date(`${refDate}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    const matterLines = matters
      .map(
        (m) =>
          `${m.id} | ${m.title}${m.case_number ? ` (${m.case_number})` : ''}` +
          `${m.client_name ? ` | client: ${m.client_name}` : ''}` +
          `${m.type_name ? ` | ${m.type_name}${m.issue_name ? ` / ${m.issue_name}` : ''}` : ''}`
      )
      .join('\n');
    const staffLines = staff.map((s) => `${s.user_id} | ${s.name}`).join('\n');

    const system = [
      'You turn a professional firm\'s voice note or meeting transcript into proposed tasks and calendar events.',
      `Reference date (day of the recording): ${refDate} (${weekday}). Time zone: ${body.timezone || 'local'}.`,
      'Resolve every relative date ("tomorrow", "next Friday", "in two weeks", "the 12th") against the reference date.',
      'A task is something someone must do (draft, file, call, send, review). Use its deadline as due_date.',
      'An event is something that happens at a time: hearing, meeting, call, deadline, consultation.',
      'A court or filing deadline may be both an event (event_type "deadline") and a task to prepare it; include both only when the transcript implies work to do.',
      'Create an event ONLY when a specific day is stated or can be resolved exactly. Vague timeframes ("sometime next week", "the week after next", "soon") are never events: if work is implied (e.g. "book a meeting with the notary"), make it a task, with due_date = the last day of that timeframe when one is given.',
      'Something still to be arranged ("book", "schedule", "set up a meeting") is a task, not an event.',
      `The speaker is ${speakerName || 'the current user'} (id ${auth.userId}). Tasks the speaker assigns to themself ("I have to…", "I will…", "remind me to…") get assignee_user_id ${auth.userId}.`,
      'Only include items stated or clearly implied. Do not invent dates, people or matters. Keep titles short and in the language of the transcript.',
      'For assignee_user_id use only ids from the staff list; for matter_id use only ids from the matters list.',
      body.case_id
        ? `The user pre-selected matter ${body.case_id}; keep it unless the transcript clearly concerns a different listed matter.`
        : 'Pick the matter whose title, client or subject is named or clearly described; otherwise null.',
      '',
      'Matters (id | title | client | type / issue):',
      matterLines || '(none)',
      '',
      'Staff (id | name):',
      staffLines || '(none)',
    ].join('\n');

    const result = await runWithTools(
      [
        { role: 'system', content: system },
        { role: 'user', content: body.transcript },
      ],
      [proposeTool],
      { forceTool: proposeTool.name, maxTokens: 4000 }
    );
    if (result.kind !== 'tool_call') {
      throw new ApiError('The AI did not return structured proposals; try again.', 502, 'AI_NO_TOOL_CALL');
    }
    const a = result.args as Record<string, unknown>;

    // ── Validate everything against this firm's data ─────────────────────────
    const matterIds = new Set(matters.map((m) => m.id));
    const staffIds = new Set(staff.map((s) => s.user_id));
    const suggestedMatter =
      typeof a.matter_id === 'string' && matterIds.has(a.matter_id) ? a.matter_id : null;

    const tasks = (Array.isArray(a.tasks) ? a.tasks : [])
      .slice(0, MAX_ITEMS)
      .map((t: Record<string, unknown>) => ({
        title: str(t.title, 200),
        description: str(t.description, 2000),
        due_date: isDate(t.due_date) ? t.due_date : null,
        priority: ['high', 'medium', 'low'].includes(t.priority as string)
          ? (t.priority as string)
          : 'medium',
        assigned_to:
          typeof t.assignee_user_id === 'string' && staffIds.has(t.assignee_user_id)
            ? t.assignee_user_id
            : null,
        task_type: TASK_TYPES.includes(t.task_type as string) ? (t.task_type as string) : 'general',
        source_quote: str(t.source_quote, 400),
      }))
      .filter((t) => t.title);

    const events = (Array.isArray(a.events) ? a.events : [])
      .slice(0, MAX_ITEMS)
      .map((e: Record<string, unknown>) => {
        const allDay = isDate(e.start);
        return {
          title: str(e.title, 200),
          description: str(e.description, 2000),
          event_type: EVENT_TYPES.includes(e.event_type as (typeof EVENT_TYPES)[number])
            ? (e.event_type as string)
            : 'meeting',
          start: isDateTime(e.start) || allDay ? (e.start as string) : null,
          end: isDateTime(e.end) ? (e.end as string) : null,
          all_day: allDay,
          location: str(e.location, 300) || null,
          source_quote: str(e.source_quote, 400),
        };
      })
      .filter((e) => e.title && e.start);

    res.status(200).json({
      success: true,
      reference_date: refDate,
      suggested_case_id: suggestedMatter ?? (body.case_id && matterIds.has(body.case_id) ? body.case_id : null),
      matter_reason: str(a.matter_reason, 300),
      tasks,
      events,
      matters: matters.map((m) => ({
        id: m.id,
        label:
          `${m.title}${m.case_number ? ` (${m.case_number})` : ''}` +
          `${m.client_name ? ` · ${m.client_name}` : ''}` +
          `${m.type_name ? ` · ${m.type_name}${m.issue_name ? ` / ${m.issue_name}` : ''}` : ''}`,
      })),
      staff: staff.map((s) => ({ id: s.user_id, name: s.name })),
      modelUsed: result.modelUsed,
    });
  })
);
