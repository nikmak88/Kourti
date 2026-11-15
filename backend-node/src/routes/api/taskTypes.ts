/**
 * Default reminder per task type (Settings → Task types), and browser push
 * subscriptions used by the reminder channel "push".
 *
 *   GET  /api/v1/task-types                 the firm's settings + can_manage
 *   PUT  /api/v1/task-types/:type           { reminder_enabled, reminder_days, reminder_channels } (admins)
 *
 *   GET    /api/v1/push/key                 VAPID public key for PushManager.subscribe
 *   POST   /api/v1/push/subscribe           { endpoint, keys: { p256dh, auth } }
 *   DELETE /api/v1/push/subscribe           { endpoint }
 *   POST   /api/v1/push/test                send a test notification to my browsers
 *
 * The task types themselves are the fixed list of the web app
 * (src/lib/taskTypes.ts); a type without a row has no default reminder.
 */
import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { isOrgAdminOrSoleMember } from '../../services/authorization.js';
import { REMINDER_CHANNELS } from '../../services/taskReminders.js';
import {
  deletePushSubscription,
  getVapidKeys,
  savePushSubscription,
  sendPushToUser,
} from '../../services/webPush.js';

export const taskTypesRouter = Router();
export const pushRouter = Router();

const typeParam = z.object({ type: z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/) });
const settingsBody = z.object({
  reminder_enabled: z.boolean(),
  reminder_days: z.number().int().min(0).max(365),
  reminder_channels: z.array(z.enum(REMINDER_CHANNELS)).min(1).max(3),
});

taskTypesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    const [rows, canManage] = await Promise.all([
      db.query(
        `select task_type, reminder_enabled, reminder_days, reminder_channels
           from public.task_type_settings where organization_id = $1`,
        [org]
      ),
      isOrgAdminOrSoleMember(userId, org),
    ]);
    res.status(200).json({ settings: rows.rows, can_manage: canManage });
  })
);

taskTypesRouter.put(
  '/:type',
  asyncHandler(async (req, res) => {
    const { userId, organizationId: org } = req.auth!;
    if (!(await isOrgAdminOrSoleMember(userId, org))) {
      throw new ApiError('Only firm administrators can change task type defaults', 403, 'FORBIDDEN');
    }
    const { type } = typeParam.parse(req.params);
    const body = settingsBody.parse(req.body);
    const r = await db.query(
      `insert into public.task_type_settings (organization_id, task_type, reminder_enabled, reminder_days, reminder_channels, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (organization_id, task_type) do update
         set reminder_enabled = excluded.reminder_enabled, reminder_days = excluded.reminder_days,
             reminder_channels = excluded.reminder_channels, updated_at = now()
       returning task_type, reminder_enabled, reminder_days, reminder_channels`,
      [org, type, body.reminder_enabled, body.reminder_days, Array.from(new Set(body.reminder_channels))]
    );
    res.status(200).json(r.rows[0]);
  })
);

// ── Browser push ────────────────────────────────────────────────────────────

pushRouter.get(
  '/key',
  asyncHandler(async (_req, res) => {
    const keys = await getVapidKeys();
    res.status(200).json({ publicKey: keys.publicKey });
  })
);

const subscribeBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

pushRouter.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { userId, organizationId } = req.auth!;
    const body = subscribeBody.parse(req.body);
    await savePushSubscription({
      userId,
      organizationId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.get('user-agent')?.slice(0, 300),
    });
    res.status(201).json({ ok: true });
  })
);

pushRouter.delete(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(req.body ?? {});
    await deletePushSubscription(req.auth!.userId, endpoint);
    res.status(204).send();
  })
);

pushRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    const { title, body } = z
      .object({ title: z.string().max(200), body: z.string().max(500) })
      .parse(req.body ?? {});
    const sent = await sendPushToUser(req.auth!.userId, { title, body, url: '/settings?tab=profile', tag: 'test' });
    res.status(200).json({ sent });
  })
);
