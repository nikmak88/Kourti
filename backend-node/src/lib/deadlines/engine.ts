// Deadline engine for Greek civil procedure (ΚΠολΔ): ordinary procedure (after Ν. 5221/2025)
// and small claims (art. 468, after Ν. 4842/2021). Pure, dependency-free. See
// decisions/0004-deadlines.md for the rules and the intentional differences from lawcase.gr.
import { addDays, addMonths, isWeekend, parseDate } from './calendar.js';
import { greekHoliday } from './holidays.js';

export type DeadlineRules = 'gr_ordinary' | 'gr_small_claims';

export interface DeadlineNote {
  kind: 'suspension' | 'weekend' | 'holiday';
  /** suspension: first skipped day; weekend/holiday: the non-working day the deadline fell on. */
  from: string;
  /** suspension: last skipped day; weekend/holiday: the day it was moved to. */
  to: string;
  /** suspension: number of days not counted. */
  days?: number;
  reason?: 'august' | 'state_summer';
  /** holiday key, e.g. 'easter_monday' (see holidays.ts). */
  holiday?: string;
}

export type DeadlineKind = 'party' | 'court' | 'backward';

export interface DeadlineRule {
  days?: number;
  months?: number;
  workingDays?: number;
  /** key of the base step, or 'filing' | 'hearing'. */
  base: string;
  direction: 'after' | 'before';
}

export interface Deadline {
  key: string;
  date: string;
  /** Plain calendar result before suspensions and weekend/holiday shifts. */
  nominalDate: string;
  rule: DeadlineRule;
  article: string;
  notes: DeadlineNote[];
  kind: DeadlineKind;
}

export interface OrdinaryInput {
  filingDate: string;
  defendantAbroad?: boolean;
  /** The State or a ΝΠΔΔ is a party → summer suspension 1 Jul – 15 Sep. */
  stateParty?: boolean;
  /** Summons under 237§3 (pleadings counted from filing). */
  summons?: boolean;
  /** Incidental actions under 238§1 (pleadings counted from filing). */
  incidental?: boolean;
  /** Known hearing date; otherwise the hearing is estimated as the preliminary-order date. */
  hearingDate?: string | null;
}

export interface SmallClaimsInput {
  filingDate: string;
  defendantAbroad?: boolean;
  stateParty?: boolean;
  hearingDate?: string | null;
}

export interface DeadlineResult {
  deadlines: Deadline[];
  hearing?: { date: string; estimated: boolean };
}

// ---------------------------------------------------------------------------
// Primitives

/** Non-working day: Saturday, Sunday or Greek public holiday. */
export function isNonWorkingDay(date: string): boolean {
  return isWeekend(date) || greekHoliday(date) !== null;
}

function suspensionReason(date: string, stateParty: boolean): DeadlineNote['reason'] | null {
  const md = date.slice(5);
  if (stateParty) return md >= '07-01' && md <= '09-15' ? 'state_summer' : null;
  return md >= '08-01' && md <= '08-31' ? 'august' : null;
}

/** Move off non-working days (forward or backward), recording one note per run. */
function shift(date: string, dir: 1 | -1, notes: DeadlineNote[]): string {
  let cur = date;
  while (isNonWorkingDay(cur)) {
    const hol = greekHoliday(cur);
    const next = addDays(cur, dir);
    const last = notes[notes.length - 1];
    const kind: DeadlineNote['kind'] = hol ? 'holiday' : 'weekend';
    if (last && last.to === cur && last.kind === kind && kind === 'weekend') {
      last.to = next;
    } else {
      notes.push(hol ? { kind, from: cur, to: next, holiday: hol } : { kind, from: cur, to: next });
    }
    cur = next;
  }
  return cur;
}

/** Count `n` calendar days after `base`, not counting days inside the suspension period. */
function countWithSuspension(base: string, n: number, stateParty: boolean, notes: DeadlineNote[]): string {
  let cur = base;
  let left = n;
  let open: DeadlineNote | null = null;
  while (left > 0) {
    cur = addDays(cur, 1);
    const reason = suspensionReason(cur, stateParty);
    if (reason) {
      if (open && open.to === addDays(cur, -1)) {
        open.to = cur;
        open.days = (open.days ?? 0) + 1;
      } else {
        open = { kind: 'suspension', from: cur, to: cur, days: 1, reason };
        notes.push(open);
      }
      continue;
    }
    left--;
  }
  return cur;
}

function addWorkingDays(base: string, n: number): string {
  let cur = base;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (!isNonWorkingDay(cur)) left--;
  }
  return cur;
}

interface StepSpec {
  key: string;
  base: string;
  baseDate: string;
  kind: DeadlineKind;
  article: string;
  days?: number;
  months?: number;
  workingDays?: number;
}

function computeStep(s: StepSpec, stateParty: boolean): Deadline {
  const notes: DeadlineNote[] = [];
  const rule: DeadlineRule = { base: s.base, direction: s.kind === 'backward' ? 'before' : 'after' };
  let nominal: string;
  let date: string;

  if (s.workingDays !== undefined) {
    rule.workingDays = s.workingDays;
    date = addWorkingDays(s.baseDate, s.workingDays);
    nominal = date; // working-day counts never land on a non-working day
  } else if (s.kind === 'backward') {
    rule.days = s.days;
    nominal = addDays(s.baseDate, -(s.days ?? 0));
    date = shift(nominal, -1, notes);
  } else {
    let raw = s.baseDate;
    if (s.months !== undefined) {
      rule.months = s.months;
      raw = addMonths(raw, s.months);
    }
    if (s.days !== undefined) rule.days = s.days;
    nominal = addDays(raw, s.days ?? 0);
    const counted =
      s.kind === 'party' && s.days !== undefined ? countWithSuspension(raw, s.days, stateParty, notes) : nominal;
    date = shift(counted, 1, notes);
  }

  return { key: s.key, date, nominalDate: nominal, rule, article: s.article, notes, kind: s.kind };
}

// ---------------------------------------------------------------------------
// Procedures

function ordinary(input: OrdinaryInput): DeadlineResult {
  parseDate(input.filingDate);
  if (input.hearingDate) parseDate(input.hearingDate);
  const abroad = !!input.defendantAbroad;
  const state = !!input.stateParty;
  const out: Deadline[] = [];
  const by: Record<string, string> = { filing: input.filingDate };
  const step = (spec: Omit<StepSpec, 'baseDate'>): Deadline => {
    const d = computeStep({ ...spec, baseDate: by[spec.base] }, state);
    by[d.key] = d.date;
    out.push(d);
    return d;
  };

  step({ key: 'service', base: 'filing', days: abroad ? 60 : 30, kind: 'party', article: '215§2 ΚΠολΔ' });
  step({ key: 'interventions', base: 'service', days: abroad ? 70 : 40, kind: 'party', article: '238§1 ΚΠολΔ' });
  step({ key: 'interventionAfterNotice', base: 'service', days: abroad ? 100 : 70, kind: 'party', article: '238§1 εδ. β ΚΠολΔ' });
  step({
    key: 'pleadings',
    base: input.summons || input.incidental ? 'filing' : 'service',
    days: abroad ? 120 : 90,
    kind: 'party',
    article: '237§1 ΚΠολΔ',
  });
  step({ key: 'addendum', base: 'pleadings', days: 15, kind: 'party', article: '237§2 ΚΠολΔ' });
  step({ key: 'judgeAssignment', base: 'addendum', days: 10, kind: 'court', article: '237§4 ΚΠολΔ' });
  const order = step({ key: 'preliminaryOrder', base: 'judgeAssignment', days: 30, kind: 'court', article: '237§3 ΚΠολΔ' });

  const hearing = input.hearingDate
    ? { date: input.hearingDate, estimated: false }
    : { date: order.date, estimated: true };
  by.hearing = hearing.date;

  step({ key: 'hearingRequest', base: 'preliminaryOrder', days: 5, kind: 'court', article: '237§3 ΚΠολΔ' });
  step({ key: 'vaguenessCompletion', base: 'hearing', days: 10, kind: 'backward', article: '237§3 εδ. γ ΚΠολΔ' });
  step({ key: 'vaguenessRebuttal', base: 'hearing', days: 5, kind: 'court', article: '269§3 ΚΠολΔ' });
  step({ key: 'witnessEvaluation', base: 'hearing', workingDays: 5, kind: 'court', article: '237§5 ΚΠολΔ' });
  step({ key: 'witnessExamination', base: 'hearing', months: 2, kind: 'court', article: '237§8 ΚΠολΔ' });
  step({ key: 'finalJudgment', base: 'witnessEvaluation', months: 8, days: 1, kind: 'court', article: '307 ΚΠολΔ' });
  step({ key: 'resummons', base: 'hearing', days: 90, kind: 'court', article: '260§2 ΚΠολΔ' });

  return { deadlines: out, hearing };
}

function smallClaims(input: SmallClaimsInput): DeadlineResult {
  parseDate(input.filingDate);
  if (input.hearingDate) parseDate(input.hearingDate);
  const abroad = !!input.defendantAbroad;
  const state = !!input.stateParty;
  const out: Deadline[] = [];
  const by: Record<string, string> = { filing: input.filingDate };
  const step = (spec: Omit<StepSpec, 'baseDate'>): Deadline => {
    const d = computeStep({ ...spec, baseDate: by[spec.base] }, state);
    by[d.key] = d.date;
    out.push(d);
    return d;
  };

  step({ key: 'service', base: 'filing', days: abroad ? 30 : 10, kind: 'party', article: '468§1 ΚΠολΔ' });
  step({ key: 'evidenceAndMemo', base: 'service', days: 20, kind: 'party', article: '468§2 ΚΠολΔ' });
  step({ key: 'rebuttal', base: 'evidenceAndMemo', days: 5, kind: 'party', article: '468§2 εδ. γ ΚΠολΔ' });
  step({ key: 'interventions', base: 'filing', days: abroad ? 40 : 20, kind: 'party', article: '468§3 ΚΠολΔ' });
  step({ key: 'interventionEvidence', base: 'filing', days: abroad ? 50 : 30, kind: 'party', article: '468§3 εδ. γ ΚΠολΔ' });
  step({ key: 'interventionRebuttal', base: 'interventionEvidence', days: 5, kind: 'party', article: '468§3 εδ. γ ΚΠολΔ' });

  let hearing: DeadlineResult['hearing'];
  if (input.hearingDate) {
    hearing = { date: input.hearingDate, estimated: false };
    by.hearing = input.hearingDate;
    step({ key: 'resummons', base: 'hearing', days: 90, kind: 'court', article: '260§2 ΚΠολΔ' });
  }
  return hearing ? { deadlines: out, hearing } : { deadlines: out };
}

export function computeDeadlines(rules: 'gr_ordinary', input: OrdinaryInput): DeadlineResult;
export function computeDeadlines(rules: 'gr_small_claims', input: SmallClaimsInput): DeadlineResult;
export function computeDeadlines(rules: DeadlineRules, input: OrdinaryInput | SmallClaimsInput): DeadlineResult;
export function computeDeadlines(rules: DeadlineRules, input: OrdinaryInput | SmallClaimsInput): DeadlineResult {
  switch (rules) {
    case 'gr_ordinary':
      return ordinary(input);
    case 'gr_small_claims':
      return smallClaims(input);
    default:
      throw new RangeError(`Unknown deadline rules: ${String(rules)}`);
  }
}
