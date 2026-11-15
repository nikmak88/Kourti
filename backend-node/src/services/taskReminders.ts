/**
 * Task reminders: "N days before the due date" on the channels chosen for the
 * task (in-app notification, email, browser push), sent to the task's assignee.
 *
 * A task carries its own reminder settings (tasks.reminder_enabled /
 * reminder_days / reminder_channels), prefilled from the firm's default for its
 * task type (public.task_type_settings, Settings → Task types). The sweep runs
 * every few minutes and sends a reminder once (tasks.reminder_sent_at), on the
 * reminder day from REMINDER_HOUR in REMINDER_TIMEZONE - or right away when the
 * task was created/changed after that moment but is not yet due. Changing the
 * due date or the reminder re-arms it (routes/api/tasks.ts).
 */
import { env } from '../config/env.js';
import { db } from '../db/pool.js';
import { sendNotificationEmail } from './email.js';
import { languageForEmail } from './emailI18n.js';
import { sendPushToUser } from './webPush.js';

export const REMINDER_CHANNELS = ['in_app', 'email', 'push'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

interface DueRow {
  id: string;
  title: string;
  due_day: string; // YYYY-MM-DD
  days_left: number;
  channels: string[] | null;
  case_id: string;
  case_title: string;
  organization_id: string;
  assigned_to: string;
  email: string | null;
}

const MONTHS_EL = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function texts(lang: 'en' | 'el', r: DueRow) {
  const [y, m, d] = r.due_day.split('-').map(Number);
  if (lang === 'el') {
    const date = `${d} ${MONTHS_EL[m - 1]} ${y}`;
    const when = r.days_left <= 0 ? 'σήμερα' : r.days_left === 1 ? 'αύριο' : `σε ${r.days_left} ημέρες`;
    return {
      title: `Υπενθύμιση: ${r.title}`,
      body: `Η εργασία «${r.title}» της υπόθεσης «${r.case_title}» λήγει ${when} (${date}).`,
      action: 'Άνοιγμα υπόθεσης',
    };
  }
  const date = `${d} ${MONTHS_EN[m - 1]} ${y}`;
  const when = r.days_left <= 0 ? 'today' : r.days_left === 1 ? 'tomorrow' : `in ${r.days_left} days`;
  return {
    title: `Reminder: ${r.title}`,
    body: `The task “${r.title}” of matter “${r.case_title}” is due ${when} (${date}).`,
    action: 'Open matter',
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Claim and send every reminder that is due now. Returns the number of tasks handled. */
export async function sendDueTaskReminders(): Promise<number> {
  const tz = env.REMINDER_TIMEZONE;
  // Claim atomically (update ... returning) so two backends never send twice.
  const claimed = await db.query<DueRow>(
    `
    with local_now as (select (now() at time zone $1) as ts)
    update public.tasks t
       set reminder_sent_at = now()
      from public.cases c, local_now ln
     where c.id = t.case_id
       and t.reminder_enabled
       and t.reminder_sent_at is null
       and not coalesce(t.completed, false)
       and t.due_date is not null
       and t.assigned_to is not null
       and t.due_date::date >= ln.ts::date
       and (t.due_date::date - coalesce(t.reminder_days, 0)) <= ln.ts::date
       and (
         (t.due_date::date - coalesce(t.reminder_days, 0)) < ln.ts::date
         or extract(hour from ln.ts) >= $2
       )
    returning t.id, t.title, to_char(t.due_date, 'YYYY-MM-DD') as due_day,
              (t.due_date::date - ln.ts::date) as days_left, t.reminder_channels as channels,
              c.id as case_id, c.title as case_title, c.organization_id, t.assigned_to,
              (select au.email from public.auth_users au where au.id = t.assigned_to) as email
    `,
    [tz, env.REMINDER_HOUR]
  );

  for (const r of claimed.rows) {
    const channels = new Set((r.channels?.length ? r.channels : ['in_app']) as string[]);
    const lang = r.email ? await languageForEmail(r.email) : env.DEFAULT_LANGUAGE;
    const tx = texts(lang, r);
    const path = `/matters/${r.case_id}`;

    if (channels.has('in_app')) {
      await db
        .query(
          `insert into public.notifications (user_id, organization_id, title, description, type, status, created_at)
           values ($1, $2, $3, $4, 'task_reminder', 'unread', now())`,
          [r.assigned_to, r.organization_id, tx.title, tx.body]
        )
        .catch((err) => console.error('[task-reminders] in-app failed:', err instanceof Error ? err.message : err));
    }
    if (channels.has('email') && r.email) {
      const url = env.APP_URL ? `${env.APP_URL.replace(/\/$/, '')}${path}` : undefined;
      // The title is also the subject line, so only strip markup characters from it.
      await sendNotificationEmail(r.email, tx.title.replace(/[<>]/g, ''), escapeHtml(tx.body), url, tx.action).catch((err) =>
        console.error('[task-reminders] email failed:', err instanceof Error ? err.message : err)
      );
    }
    if (channels.has('push')) {
      await sendPushToUser(r.assigned_to, { title: tx.title, body: tx.body, url: path, tag: `task-${r.id}` }).catch(
        (err) => console.error('[task-reminders] push failed:', err instanceof Error ? err.message : err)
      );
    }
  }
  return claimed.rowCount ?? 0;
}

let timer: NodeJS.Timeout | null = null;

export function startTaskReminderSweep(intervalMs = 10 * 60 * 1000) {
  if (timer) return;
  const run = () => {
    void sendDueTaskReminders()
      .then((n) => {
        if (n) console.log(`[task-reminders] sent ${n} reminder(s)`);
      })
      .catch((err) => console.error('[task-reminders] sweep failed:', err instanceof Error ? err.message : err));
  };
  setTimeout(run, 30_000).unref?.();
  timer = setInterval(run, intervalMs);
  timer.unref?.();
}
