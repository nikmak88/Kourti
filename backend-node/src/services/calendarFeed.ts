/**
 * Personal calendar subscription feed (iCalendar / RFC 5545).
 *
 * Each user gets a secret URL, /api/v1/calendar-feed/<token>.ics, that Outlook,
 * Apple Calendar, Thunderbird or Google Calendar can subscribe to (read-only).
 * It contains:
 *   - the firm's calendar events (as on the Calendar page),
 *   - each matter's next hearing date,
 *   - the user's own open tasks with a due date (all-day), with the task's
 *     reminder as an alarm at 09:00 N days before.
 * Whoever has the URL can read it: "Reset link" (POST /calendar/feed/reset)
 * issues a new token and the old URL stops working.
 *
 * Google Calendar fetches subscriptions from Google's servers, so it only
 * works when the Kourti server is reachable from the internet; Outlook
 * desktop and Apple Calendar fetch from the user's computer.
 */
import { randomBytes } from 'node:crypto';

import { env } from '../config/env.js';
import { db } from '../db/pool.js';

export async function getOrCreateFeedToken(userId: string, organizationId: string): Promise<string> {
  const existing = await db.query<{ token: string }>(
    'select token from public.calendar_feed_tokens where user_id = $1 and organization_id = $2',
    [userId, organizationId]
  );
  if (existing.rows[0]) return existing.rows[0].token;
  return resetFeedToken(userId, organizationId);
}

export async function resetFeedToken(userId: string, organizationId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `insert into public.calendar_feed_tokens (user_id, organization_id, token)
     values ($1, $2, $3)
     on conflict (user_id) do update set token = excluded.token, organization_id = excluded.organization_id,
       created_at = now(), last_fetched_at = null`,
    [userId, organizationId, token]
  );
  return token;
}

export function feedUrl(token: string): string {
  const base = (env.APP_URL || '').replace(/\/$/, '');
  return `${base}/api/v1/calendar-feed/${token}.ics`;
}

// ── iCalendar formatting ────────────────────────────────────────────────────

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold to 75 octets per line (UTF-8 safe), CRLF + space continuation. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const dateOnly = (ymd: string) => ymd.replace(/-/g, '');
const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

interface VEvent {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: { date: string } | { at: Date };
  end: { date: string } | { at: Date };
  updated?: Date;
  /** Alarm: hours relative to the start (negative = before). */
  alarmHours?: number;
  alarmText?: string;
}

function vevent(e: VEvent): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${utc(e.updated ?? new Date())}`];
  lines.push('date' in e.start ? `DTSTART;VALUE=DATE:${dateOnly(e.start.date)}` : `DTSTART:${utc(e.start.at)}`);
  lines.push('date' in e.end ? `DTEND;VALUE=DATE:${dateOnly(e.end.date)}` : `DTEND:${utc(e.end.at)}`);
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.alarmHours !== undefined) {
    const h = e.alarmHours;
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.alarmText ?? e.summary)}`,
      `TRIGGER:${h < 0 ? '-' : ''}PT${Math.abs(h)}H`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

const TEXT = {
  en: { hearing: 'Hearing', task: 'Task', matter: 'Matter', calName: 'Kourti' },
  el: { hearing: 'Δικάσιμος', task: 'Εργασία', matter: 'Υπόθεση', calName: 'Kourti' },
};

/** Build the user's feed, or null when the token is unknown. */
export async function buildFeedForToken(token: string): Promise<string | null> {
  const owner = await db.query<{ user_id: string; organization_id: string; lang: string | null }>(
    `update public.calendar_feed_tokens f set last_fetched_at = now()
       from public.profiles p
      where f.token = $1 and p.user_id = f.user_id
      returning f.user_id, f.organization_id, p.preferred_language as lang`,
    [token]
  );
  const o = owner.rows[0];
  if (!o) return null;
  const tx = TEXT[o.lang === 'el' || o.lang === 'en' ? o.lang : env.DEFAULT_LANGUAGE];
  const tz = env.REMINDER_TIMEZONE;
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');

  const [events, hearings, tasks] = await Promise.all([
    db.query(
      `select id, title, description, location, start_date, end_date, updated_at
         from public.calendar_events
        where organization_id = $1 and start_date >= now() - interval '90 days'
          and start_date <= now() + interval '2 years'`,
      [o.organization_id]
    ),
    db.query(
      `select id, title, case_number, court, next_hearing_date, updated_at,
              to_char(next_hearing_date at time zone $2, 'YYYY-MM-DD') as local_day,
              (next_hearing_date at time zone $2)::time = '00:00' as all_day
         from public.cases
        where organization_id = $1 and next_hearing_date is not null
          and next_hearing_date >= now() - interval '90 days'`,
      [o.organization_id, tz]
    ),
    db.query(
      `select t.id, t.title, t.description, t.updated_at, t.reminder_enabled, t.reminder_days,
              to_char(t.due_date, 'YYYY-MM-DD') as due_day, c.id as case_id, c.title as case_title
         from public.tasks t join public.cases c on c.id = t.case_id
        where c.organization_id = $1 and t.assigned_to = $2 and not coalesce(t.completed, false)
          and t.due_date is not null and t.due_date >= now() - interval '90 days'`,
      [o.organization_id, o.user_id]
    ),
  ]);

  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kourti//Calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${tx.calName}`,
    `X-WR-TIMEZONE:${tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const e of events.rows) {
    const start = new Date(e.start_date);
    const end = e.end_date ? new Date(e.end_date) : new Date(start.getTime() + 3600_000);
    out.push(
      ...vevent({
        uid: `event-${e.id}@kourti`,
        summary: e.title,
        description: e.description,
        location: e.location,
        start: { at: start },
        end: { at: end > start ? end : new Date(start.getTime() + 3600_000) },
        updated: e.updated_at ? new Date(e.updated_at) : undefined,
      })
    );
  }

  for (const h of hearings.rows) {
    const at = new Date(h.next_hearing_date);
    out.push(
      ...vevent({
        uid: `hearing-${h.id}@kourti`,
        summary: `${tx.hearing}: ${h.title}`,
        description: [h.case_number, appUrl && `${appUrl}/matters/${h.id}`].filter(Boolean).join('\n'),
        location: h.court,
        start: h.all_day ? { date: h.local_day } : { at },
        end: h.all_day ? { date: nextDay(h.local_day) } : { at: new Date(at.getTime() + 3600_000) },
        updated: h.updated_at ? new Date(h.updated_at) : undefined,
      })
    );
  }

  for (const t of tasks.rows) {
    const days = t.reminder_days ?? 0;
    out.push(
      ...vevent({
        uid: `task-${t.id}@kourti`,
        summary: `${t.title} (${tx.matter}: ${t.case_title})`,
        description: [t.description, appUrl && `${appUrl}/matters/${t.case_id}`].filter(Boolean).join('\n\n'),
        start: { date: t.due_day },
        end: { date: nextDay(t.due_day) },
        updated: t.updated_at ? new Date(t.updated_at) : undefined,
        // 09:00 on the reminder day: the all-day start is 00:00 of the due day.
        alarmHours: t.reminder_enabled ? 9 - 24 * days : undefined,
        alarmText: `${tx.task}: ${t.title}`,
      })
    );
  }

  out.push('END:VCALENDAR');
  return out.map(fold).join('\r\n') + '\r\n';
}
