/**
 * Browser push notifications (Web Push / VAPID).
 *
 * The VAPID key pair is generated on first use and kept in
 * public.server_secrets, so self-hosted installs need no extra configuration.
 * Browsers subscribe through POST /api/v1/notifications/push/subscribe (the
 * web app's service worker shows the notification, public/push-sw.js).
 * Push only works when the site is a secure context: HTTPS with a certificate
 * the browser trusts (for the self-signed certificate: imported as trusted).
 */
import webpush from 'web-push';

import { db } from '../db/pool.js';
import { env } from '../config/env.js';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keysPromise: Promise<VapidKeys> | null = null;

async function loadKeys(): Promise<VapidKeys> {
  const existing = await db.query<{ key: string; value: string }>(
    `select key, value from public.server_secrets where key in ('vapid_public_key', 'vapid_private_key')`
  );
  const map = new Map(existing.rows.map((r) => [r.key, r.value]));
  if (map.get('vapid_public_key') && map.get('vapid_private_key')) {
    return { publicKey: map.get('vapid_public_key')!, privateKey: map.get('vapid_private_key')! };
  }
  const generated = webpush.generateVAPIDKeys();
  // Two backends starting at once: the first insert wins, then re-read.
  await db.query(
    `insert into public.server_secrets (key, value) values ('vapid_public_key', $1), ('vapid_private_key', $2)
     on conflict (key) do nothing`,
    [generated.publicKey, generated.privateKey]
  );
  const again = await db.query<{ key: string; value: string }>(
    `select key, value from public.server_secrets where key in ('vapid_public_key', 'vapid_private_key')`
  );
  const m = new Map(again.rows.map((r) => [r.key, r.value]));
  return { publicKey: m.get('vapid_public_key')!, privateKey: m.get('vapid_private_key')! };
}

export async function getVapidKeys(): Promise<VapidKeys> {
  if (!keysPromise) {
    keysPromise = loadKeys().catch((err) => {
      keysPromise = null;
      throw err;
    });
  }
  return keysPromise;
}

export async function savePushSubscription(args: {
  userId: string;
  organizationId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  await db.query(
    `insert into public.push_subscriptions (user_id, organization_id, endpoint, p256dh, auth, user_agent)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, organization_id = excluded.organization_id,
           p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [args.userId, args.organizationId, args.endpoint, args.p256dh, args.auth, args.userAgent ?? null]
  );
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.query('delete from public.push_subscriptions where user_id = $1 and endpoint = $2', [
    userId,
    endpoint,
  ]);
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path in the web app opened when the notification is clicked. */
  url?: string;
  tag?: string;
}

/** Send to every browser of the user. Returns how many deliveries succeeded. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subs = await db.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    'select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = $1',
    [userId]
  );
  if (!subs.rows.length) return 0;
  const keys = await getVapidKeys();
  const subject = env.APP_URL?.startsWith('https://') ? env.APP_URL : 'mailto:noreply@kourti.local';
  let sent = 0;
  for (const s of subs.rows) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600 }
      );
      sent++;
      await db.query('update public.push_subscriptions set last_used_at = now() where id = $1', [s.id]);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped the subscription - forget it.
      if (status === 404 || status === 410) {
        await db.query('delete from public.push_subscriptions where id = $1', [s.id]);
      } else {
        console.error('[web-push] send failed:', status ?? (err instanceof Error ? err.message : err));
      }
    }
  }
  return sent;
}
