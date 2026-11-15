import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { recordCaseEvent } from '../../services/caseEvents.js';
import { REMINDER_CHANNELS } from '../../services/taskReminders.js';

const listTasksQuerySchema = z.object({
  caseId: z.string().uuid(),
});

const createTaskBodySchema = z.object({
  case_id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  // Omitted → the creator; 'unassigned' → nobody. (app.ts strips nulls from
  // request bodies, so "no value" needs an explicit sentinel.)
  assigned_to: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  task_type: z.string().optional(),
  // Reminder (services/taskReminders.ts). Omitted on create → the firm's
  // default for the task type (task_type_settings).
  reminder_enabled: z.boolean().optional(),
  reminder_days: z.number().int().min(0).max(365).nullable().optional(),
  reminder_channels: z.array(z.enum(REMINDER_CHANNELS)).max(3).nullable().optional(),
  // Computed procedural deadline the due date was taken from (lib/deadlines); '' clears it.
  deadline_key: z.string().max(64).optional(),
});

const updateTaskParamsSchema = z.object({
  taskId: z.string().uuid(),
});

const updateTaskBodySchema = createTaskBodySchema.partial().extend({
  completed: z.boolean().optional(),
});

export const tasksRouter = Router();

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { caseId } = listTasksQuerySchema.parse(req.query);

    const result = await db.query(
      `
      select t.*
      from public.tasks t
      join public.cases c on c.id = t.case_id
      where t.case_id = $1
        and c.organization_id = $2
      order by t.due_date asc nulls last, t.created_at desc
      `,
      [caseId, auth.organizationId]
    );

    res.status(200).json(result.rows);
  })
);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = createTaskBodySchema.parse(req.body);

    const caseCheck = await db.query(
      'select id from public.cases where id = $1 and organization_id = $2 limit 1',
      [body.case_id, auth.organizationId]
    );

    if (!caseCheck.rows[0]) {
      throw new ApiError('Case not found', 404, 'NOT_FOUND');
    }

    // Reminder defaults of the task type, unless the client sent its own.
    let reminderEnabled = body.reminder_enabled;
    let reminderDays = body.reminder_days ?? null;
    let reminderChannels: string[] | null = body.reminder_channels ?? null;
    if (reminderEnabled === undefined) {
      const def = await db.query<{ reminder_enabled: boolean; reminder_days: number; reminder_channels: string[] }>(
        `select reminder_enabled, reminder_days, reminder_channels from public.task_type_settings
          where organization_id = $1 and task_type = $2`,
        [auth.organizationId, body.task_type || 'general']
      );
      const d = def.rows[0];
      reminderEnabled = d?.reminder_enabled ?? false;
      if (d && reminderDays === null) reminderDays = d.reminder_days;
      if (d && reminderChannels === null) reminderChannels = d.reminder_channels;
    }

    const result = await db.query(
      `
      insert into public.tasks (
        case_id,
        title,
        description,
        due_date,
        priority,
        assigned_to,
        task_type,
        created_by,
        completed,
        reminder_enabled,
        reminder_days,
        reminder_channels,
        deadline_key,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12, now())
      returning *
      `,
      [
        body.case_id,
        body.title,
        body.description || null,
        body.due_date || null,
        body.priority || null,
        // Tasks belong to whoever creates them unless assigned to someone else.
        body.assigned_to === undefined ? auth.userId : body.assigned_to === 'unassigned' ? null : body.assigned_to,
        body.task_type || null,
        auth.userId,
        reminderEnabled,
        reminderDays,
        reminderChannels,
        body.deadline_key || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  })
);

tasksRouter.patch(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { taskId } = updateTaskParamsSchema.parse(req.params);
    const body = updateTaskBodySchema.parse(req.body);

    const ownership = await db.query<{
      id: string;
      completed: boolean;
      case_id: string | null;
      title: string;
    }>(
      `
      select t.id, t.completed, t.case_id, t.title
      from public.tasks t
      join public.cases c on c.id = t.case_id
      where t.id = $1 and c.organization_id = $2
      limit 1
      `,
      [taskId, auth.organizationId]
    );

    if (!ownership.rows[0]) {
      throw new ApiError('Task not found', 404, 'NOT_FOUND');
    }

    const preTask = ownership.rows[0];

    const updates: Array<{ column: string; value: unknown }> = [
      { column: 'title', value: body.title },
      { column: 'description', value: body.description },
      { column: 'due_date', value: body.due_date },
      { column: 'priority', value: body.priority },
      { column: 'assigned_to', value: body.assigned_to === 'unassigned' ? null : body.assigned_to },
      { column: 'task_type', value: body.task_type },
      { column: 'completed', value: body.completed },
      { column: 'reminder_enabled', value: body.reminder_enabled },
      { column: 'reminder_days', value: body.reminder_days },
      { column: 'reminder_channels', value: body.reminder_channels },
      { column: 'deadline_key', value: body.deadline_key === undefined ? undefined : body.deadline_key || null },
    ].filter((entry) => entry.value !== undefined);
    // A new due date or reminder re-arms the reminder.
    const rearm = [body.due_date, body.reminder_enabled, body.reminder_days, body.reminder_channels].some(
      (v) => v !== undefined
    );

    if (!updates.length) {
      throw new ApiError('No update fields provided', 400, 'VALIDATION_ERROR');
    }

    const setClause = updates.map((entry, index) => `${entry.column} = $${index + 1}`).join(', ');
    const values = updates.map((entry) => entry.value);

    const result = await db.query(
      `
      update public.tasks
      set ${setClause}, updated_at = now()${rearm ? ', reminder_sent_at = null' : ''}
      where id = $${updates.length + 1}
      returning *
      `,
      [...values, taskId]
    );

    // Emit task_completed when the task transitions false → true and has a case.
    if (body.completed === true && preTask.completed === false && preTask.case_id) {
      await recordCaseEvent({
        organizationId: auth.organizationId,
        caseId: preTask.case_id,
        eventType: 'task_completed',
        title: result.rows[0]?.title ?? preTask.title,
        actorType: 'staff',
        actorId: auth.userId,
      });
    }

    res.status(200).json(result.rows[0]);
  })
);

tasksRouter.delete(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { taskId } = updateTaskParamsSchema.parse(req.params);

    const result = await db.query(
      `
      delete from public.tasks t
      using public.cases c
      where t.case_id = c.id
        and t.id = $1
        and c.organization_id = $2
      returning t.id
      `,
      [taskId, auth.organizationId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Task not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);
