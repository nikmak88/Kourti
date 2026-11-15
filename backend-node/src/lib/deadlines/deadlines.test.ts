// Deadline engine tests. backend-node has no test runner, so this uses node:test + node:assert:
//   cd backend-node && npx tsx --test src/lib/deadlines/deadlines.test.ts
// Fixtures are lawcase.gr results captured on 2026-11-15 (see decisions/0004-deadlines.md).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  computeDeadlines,
  greekHoliday,
  greekHolidays,
  LABELS_EL,
  orthodoxEaster,
  type DeadlineResult,
  type OrdinaryInput,
  type SmallClaimsInput,
} from './index.js';

type Dates = Record<string, string>;

function dates(r: DeadlineResult): Dates {
  const out: Dates = Object.fromEntries(r.deadlines.map((d) => [d.key, d.date]));
  if (r.hearing) out.hearing = r.hearing.date;
  return out;
}

// ---------------------------------------------------------------------------
// Calendar primitives

test('orthodoxEaster matches known dates', () => {
  assert.equal(orthodoxEaster(2000), '2000-04-30');
  assert.equal(orthodoxEaster(2024), '2024-05-05');
  assert.equal(orthodoxEaster(2025), '2025-04-20');
  assert.equal(orthodoxEaster(2026), '2026-04-12');
  assert.equal(orthodoxEaster(2027), '2027-05-02');
  assert.equal(orthodoxEaster(2028), '2028-04-16');
  assert.throws(() => orthodoxEaster(2100), RangeError);
});

test('greek holidays 2027', () => {
  assert.deepEqual(
    [...greekHolidays(2027).entries()].sort(([a], [b]) => a.localeCompare(b)),
    [
      ['2027-01-01', 'new_year'],
      ['2027-01-06', 'epiphany'],
      ['2027-03-15', 'clean_monday'],
      ['2027-03-25', 'independence_day'],
      ['2027-04-30', 'good_friday'],
      ['2027-05-01', 'labour_day'],
      ['2027-05-03', 'easter_monday'],
      ['2027-06-21', 'holy_spirit_monday'],
      ['2027-08-15', 'assumption'],
      ['2027-10-28', 'ochi_day'],
      ['2027-12-25', 'christmas'],
      ['2027-12-26', 'synaxis_theotokos'],
    ],
  );
  assert.equal(greekHoliday('2027-05-04'), null);
});

test('addMonths clamps to month end', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2027-08-31', 2), '2027-10-31');
  assert.equal(addMonths('2027-11-30', 3), '2028-02-29');
});

test('invalid input is rejected', () => {
  assert.throws(() => computeDeadlines('gr_ordinary', { filingDate: '15-06-2026' }), RangeError);
  assert.throws(() => computeDeadlines('gr_ordinary', { filingDate: '2026-02-30' }), RangeError);
  assert.throws(() => computeDeadlines('gr_small_claims', { filingDate: '2026-06-15', hearingDate: 'x' }), RangeError);
});

// ---------------------------------------------------------------------------
// Notes / metadata

test('suspension and shift notes (t1 interventionAfterNotice, t14 service)', () => {
  const t1 = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15' });
  const ian = t1.deadlines.find((d) => d.key === 'interventionAfterNotice')!;
  assert.equal(ian.kind, 'party');
  assert.equal(ian.article, '238§1 εδ. β ΚΠολΔ');
  assert.deepEqual(ian.rule, { base: 'service', direction: 'after', days: 70 });
  assert.equal(ian.nominalDate, '2026-09-23');
  assert.deepEqual(ian.notes, [
    { kind: 'suspension', from: '2026-08-01', to: '2026-08-31', days: 31, reason: 'august' },
    { kind: 'weekend', from: '2026-10-24', to: '2026-10-26' },
  ]);

  const t14 = computeDeadlines('gr_ordinary', { filingDate: '2027-04-02' });
  const svc = t14.deadlines.find((d) => d.key === 'service')!;
  assert.equal(svc.nominalDate, '2027-05-02');
  assert.deepEqual(svc.notes, [
    { kind: 'weekend', from: '2027-05-02', to: '2027-05-03' },
    { kind: 'holiday', from: '2027-05-03', to: '2027-05-04', holiday: 'easter_monday' },
  ]);
});

test('state party uses the 1 Jul – 15 Sep suspension', () => {
  const r = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15', stateParty: true });
  assert.deepEqual(r.deadlines[0].notes, [
    { kind: 'suspension', from: '2026-07-01', to: '2026-09-15', days: 77, reason: 'state_summer' },
  ]);
});

test('court deadlines ignore the suspension; backward deadlines move to the previous working day', () => {
  // Known hearing inside August: hearing-based court steps run through the suspension.
  const r = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15', hearingDate: '2026-08-10' });
  const by = Object.fromEntries(r.deadlines.map((d) => [d.key, d]));
  assert.equal(by.resummons.date, '2026-11-09'); // 2026-11-08 Sun → Mon, August not skipped
  assert.equal(by.vaguenessRebuttal.date, '2026-08-17'); // 08-15 Sat + Assumption → 08-16 Sun → Mon 17
  assert.deepEqual(by.vaguenessRebuttal.notes, [
    { kind: 'holiday', from: '2026-08-15', to: '2026-08-16', holiday: 'assumption' },
    { kind: 'weekend', from: '2026-08-16', to: '2026-08-17' },
  ]);
  assert.equal(by.vaguenessCompletion.kind, 'backward');
  assert.equal(by.vaguenessCompletion.rule.direction, 'before');
  // 2026-08-10 − 10 = 2026-07-31 (Fri, working) → unchanged
  assert.equal(by.vaguenessCompletion.date, '2026-07-31');
  assert.deepEqual(r.hearing, { date: '2026-08-10', estimated: false });

  const back = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15', hearingDate: '2027-01-11' });
  const vc = back.deadlines.find((d) => d.key === 'vaguenessCompletion')!;
  assert.equal(vc.nominalDate, '2027-01-01');
  assert.equal(vc.date, '2026-12-31');
  assert.deepEqual(vc.notes, [{ kind: 'holiday', from: '2027-01-01', to: '2026-12-31', holiday: 'new_year' }]);
});

test('estimated hearing equals the preliminary order date', () => {
  const r = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15' });
  assert.deepEqual(r.hearing, { date: '2027-01-11', estimated: true });
  assert.equal(r.deadlines.find((d) => d.key === 'preliminaryOrder')!.date, '2027-01-11');
});

test('LABELS_EL covers every key produced', () => {
  const o = computeDeadlines('gr_ordinary', { filingDate: '2026-06-15' });
  for (const d of o.deadlines) assert.ok(LABELS_EL.gr_ordinary[d.key], d.key);
  const m = computeDeadlines('gr_small_claims', { filingDate: '2026-06-15', hearingDate: '2026-11-20' });
  for (const d of m.deadlines) assert.ok(LABELS_EL.gr_small_claims[d.key], d.key);
});

// ---------------------------------------------------------------------------
// lawcase.gr fixtures — ordinary procedure (filing 2026-06-15 unless stated).
// SITE = what lawcase.gr returned; OVERRIDE = where our rules intentionally differ.

const SITE_ORDINARY: Record<string, { input: OrdinaryInput; site: Dates; override?: Dates }> = {
  t1_base: {
    input: { filingDate: '2026-06-15' },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-11-13', addendum: '2026-11-30', judgeAssignment: '2026-12-10', preliminaryOrder: '2027-01-11', hearingRequest: '2027-01-18', vaguenessCompletion: '2027-01-01', vaguenessRebuttal: '2027-01-18', witnessEvaluation: '2027-01-18', witnessExamination: '2027-03-11', finalJudgment: '2027-09-20', resummons: '2027-04-12', hearing: '2027-01-11' },
    // DEVIATION (backward): 2027-01-01 is New Year's Day; site leaves it unshifted, we move to the previous working day.
    override: { vaguenessCompletion: '2026-12-31' },
  },
  t3_state: {
    input: { filingDate: '2026-06-15', stateParty: true },
    site: { service: '2026-09-30', interventions: '2026-11-09', interventionAfterNotice: '2026-12-09', pleadings: '2026-12-29', addendum: '2027-01-13', judgeAssignment: '2027-01-25', preliminaryOrder: '2027-02-24', hearingRequest: '2027-03-01', vaguenessCompletion: '2027-02-15', vaguenessRebuttal: '2027-03-01', witnessEvaluation: '2027-03-03', witnessExamination: '2027-04-26', finalJudgment: '2027-11-04', resummons: '2027-05-25', hearing: '2027-02-24' },
    // DEVIATION (backward): 2027-02-14 Sun; site → Mon 02-15, we → Fri 02-12.
    override: { vaguenessCompletion: '2027-02-12' },
  },
  // Ειρηνοδικείο (kathulhn=Eir) — same rules, same result as t1.
  t4_eir: {
    input: { filingDate: '2026-06-15' },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-11-13', addendum: '2026-11-30', judgeAssignment: '2026-12-10', preliminaryOrder: '2027-01-11', hearingRequest: '2027-01-18', vaguenessCompletion: '2027-01-01', vaguenessRebuttal: '2027-01-18', witnessEvaluation: '2027-01-18', witnessExamination: '2027-03-11', finalJudgment: '2027-09-20', resummons: '2027-04-12', hearing: '2027-01-11' },
    // DEVIATION (backward): as t1.
    override: { vaguenessCompletion: '2026-12-31' },
  },
  t5_dec: {
    input: { filingDate: '2026-12-10' },
    site: { service: '2027-01-11', interventions: '2027-02-22', interventionAfterNotice: '2027-03-22', pleadings: '2027-04-12', addendum: '2027-04-27', judgeAssignment: '2027-05-07', preliminaryOrder: '2027-06-07', hearingRequest: '2027-06-14', vaguenessCompletion: '2027-05-28', vaguenessRebuttal: '2027-06-14', witnessEvaluation: '2027-06-14', witnessExamination: '2027-08-09', finalJudgment: '2028-02-15', resummons: '2027-09-06', hearing: '2027-06-07' },
  },
  t6_knownhearing: {
    input: { filingDate: '2026-06-15', hearingDate: '2027-01-15' },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-11-13', addendum: '2026-11-30', judgeAssignment: '2026-12-10', preliminaryOrder: '2027-01-11', hearingRequest: '2027-01-18', vaguenessCompletion: '2027-01-05', vaguenessRebuttal: '2027-01-20', witnessEvaluation: '2027-01-22', witnessExamination: '2027-03-15', finalJudgment: '2027-09-23', resummons: '2027-04-15', hearing: '2027-01-15' },
    // DEVIATION (Clean Monday): 2027-03-15 is Καθαρά Δευτέρα; site does not treat it as a holiday, we shift to 03-16.
    override: { witnessExamination: '2027-03-16' },
  },
  t7_klhsh_par: {
    input: { filingDate: '2026-06-15', summons: true, incidental: true },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-10-14', addendum: '2026-10-29', judgeAssignment: '2026-11-09', preliminaryOrder: '2026-12-09', hearingRequest: '2026-12-14', vaguenessCompletion: '2026-11-30', vaguenessRebuttal: '2026-12-14', witnessEvaluation: '2026-12-16', witnessExamination: '2027-02-09', finalJudgment: '2027-08-17', resummons: '2027-03-09', hearing: '2026-12-09' },
    // DEVIATION (backward): 2026-11-29 Sun; site → Mon 11-30, we → Fri 11-27.
    override: { vaguenessCompletion: '2026-11-27' },
  },
  t8_mar27: {
    input: { filingDate: '2027-03-02' },
    site: { service: '2027-04-01', interventions: '2027-05-11', interventionAfterNotice: '2027-06-10', pleadings: '2027-06-30', addendum: '2027-07-15', judgeAssignment: '2027-07-26', preliminaryOrder: '2027-08-25', hearingRequest: '2027-08-30', vaguenessCompletion: '2027-08-16', vaguenessRebuttal: '2027-08-30', witnessEvaluation: '2027-09-01', witnessExamination: '2027-10-25', finalJudgment: '2028-05-02', resummons: '2027-11-23', hearing: '2027-08-25' },
    // DEVIATION (backward): 2027-08-15 Sun (and holiday); site → Mon 08-16, we → Fri 08-13.
    override: { vaguenessCompletion: '2027-08-13' },
  },
  t10_klhsh: {
    input: { filingDate: '2026-06-15', summons: true },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-10-14', addendum: '2026-10-29', judgeAssignment: '2026-11-09', preliminaryOrder: '2026-12-09', hearingRequest: '2026-12-14', vaguenessCompletion: '2026-11-30', vaguenessRebuttal: '2026-12-14', witnessEvaluation: '2026-12-16', witnessExamination: '2027-02-09', finalJudgment: '2027-08-17', resummons: '2027-03-09', hearing: '2026-12-09' },
    // DEVIATION (backward): as t7.
    override: { vaguenessCompletion: '2026-11-27' },
  },
  t11_agwghpar: {
    input: { filingDate: '2026-06-15', incidental: true },
    site: { service: '2026-07-15', interventions: '2026-09-24', interventionAfterNotice: '2026-10-26', pleadings: '2026-10-14', addendum: '2026-10-29', judgeAssignment: '2026-11-09', preliminaryOrder: '2026-12-09', hearingRequest: '2026-12-14', vaguenessCompletion: '2026-11-30', vaguenessRebuttal: '2026-12-14', witnessEvaluation: '2026-12-16', witnessExamination: '2027-02-09', finalJudgment: '2027-08-17', resummons: '2027-03-09', hearing: '2026-12-09' },
    // DEVIATION (backward): as t7.
    override: { vaguenessCompletion: '2026-11-27' },
  },
  t13_25mar: {
    input: { filingDate: '2027-02-23' },
    site: { service: '2027-03-26', interventions: '2027-05-05', interventionAfterNotice: '2027-06-04', pleadings: '2027-06-24', addendum: '2027-07-09', judgeAssignment: '2027-07-19', preliminaryOrder: '2027-08-18', hearingRequest: '2027-08-23', vaguenessCompletion: '2027-08-09', vaguenessRebuttal: '2027-08-23', witnessEvaluation: '2027-08-25', witnessExamination: '2027-10-18', finalJudgment: '2028-04-26', resummons: '2027-11-16', hearing: '2027-08-18' },
    // DEVIATION (backward): 2027-08-08 Sun; site → Mon 08-09, we → Fri 08-06.
    override: { vaguenessCompletion: '2027-08-06' },
  },
  t14_easter: {
    input: { filingDate: '2027-04-02' },
    site: { service: '2027-05-04', interventions: '2027-06-14', interventionAfterNotice: '2027-07-13', pleadings: '2027-09-02', addendum: '2027-09-17', judgeAssignment: '2027-09-27', preliminaryOrder: '2027-10-27', hearingRequest: '2027-11-01', vaguenessCompletion: '2027-10-18', vaguenessRebuttal: '2027-11-01', witnessEvaluation: '2027-11-03', witnessExamination: '2027-12-27', finalJudgment: '2028-07-04', resummons: '2028-01-25', hearing: '2027-10-27' },
    override: {
      // DEVIATION (backward): 2027-10-17 Sun; site → Mon 10-18, we → Fri 10-15.
      vaguenessCompletion: '2027-10-15',
      // DEVIATION (working days): site counts 28 Oct (holiday) as a working day; we skip it → 11-04 not 11-03.
      witnessEvaluation: '2027-11-04',
      // …and finalJudgment (witnessEvaluation + 8 months + 1 day) follows: 2028-07-05 not 07-04.
      finalJudgment: '2028-07-05',
    },
  },
  t15_state_dec: {
    input: { filingDate: '2026-12-10', stateParty: true },
    site: { service: '2027-01-11', interventions: '2027-02-22', interventionAfterNotice: '2027-03-22', pleadings: '2027-04-12', addendum: '2027-04-27', judgeAssignment: '2027-05-07', preliminaryOrder: '2027-06-07', hearingRequest: '2027-06-14', vaguenessCompletion: '2027-05-28', vaguenessRebuttal: '2027-06-14', witnessEvaluation: '2027-06-14', witnessExamination: '2027-08-09', finalJudgment: '2028-02-15', resummons: '2027-09-06', hearing: '2027-06-07' },
  },
  t16_state_apr: {
    input: { filingDate: '2027-04-15', stateParty: true },
    site: { service: '2027-05-17', interventions: '2027-06-28', interventionAfterNotice: '2027-10-11', pleadings: '2027-11-01', addendum: '2027-11-16', judgeAssignment: '2027-11-26', preliminaryOrder: '2027-12-27', hearingRequest: '2028-01-03', vaguenessCompletion: '2027-12-17', vaguenessRebuttal: '2028-01-03', witnessEvaluation: '2028-01-03', witnessExamination: '2028-02-28', finalJudgment: '2028-09-04', resummons: '2028-03-27', hearing: '2027-12-27' },
    // DEVIATION (Clean Monday): 2027-02-27 Sun → site Mon 2028-02-28, but that is Καθαρά Δευτέρα 2028 → we go to 02-29.
    override: { witnessExamination: '2028-02-29' },
  },
};

for (const [name, c] of Object.entries(SITE_ORDINARY)) {
  test(`lawcase.gr ordinary ${name}`, () => {
    const got = dates(computeDeadlines('gr_ordinary', c.input));
    assert.deepEqual(got, { ...c.site, ...c.override });
  });
}

// Defendant abroad: service is filing + 60 (art. 215§2 as amended); lawcase.gr still uses 30,
// so everything downstream is ~30 days later than the site. Values are our own (hand-checked
// for service/interventions); the site's numbers are kept in comments for reference.
test('ordinary t2_abroad (own expectations; site uses 30-day service)', () => {
  // site: service 2026-07-15, interventions 2026-10-26, interventionAfterNotice 2026-11-23, pleadings 2026-12-14, hearing 2027-02-08
  const got = dates(computeDeadlines('gr_ordinary', { filingDate: '2026-06-15', defendantAbroad: true }));
  assert.deepEqual(got, {
    service: '2026-09-14', // 15 June days + 31 July days + 14 Sep (August suspended)
    interventions: '2026-11-23', // service + 70
    interventionAfterNotice: '2026-12-23', // service + 100
    pleadings: '2027-01-12', // service + 120 (2027-01-12 Tue)
    addendum: '2027-01-27',
    judgeAssignment: '2027-02-08', // 02-06 Sat → Mon
    preliminaryOrder: '2027-03-10',
    hearingRequest: '2027-03-16', // 03-15 Clean Monday → Tue
    vaguenessCompletion: '2027-02-26', // 02-28 Sun → previous working day
    vaguenessRebuttal: '2027-03-16', // 03-15 Clean Monday → Tue
    witnessEvaluation: '2027-03-18', // 11,12,(15 holiday),16,17,18
    witnessExamination: '2027-05-10',
    finalJudgment: '2027-11-19',
    resummons: '2027-06-08',
    hearing: '2027-03-10',
  });
});

test('ordinary t12_abroad_state (own expectations; site uses 30-day service)', () => {
  // site: service 2026-09-30, interventions 2026-12-09, hearing 2027-03-24
  const got = dates(computeDeadlines('gr_ordinary', { filingDate: '2026-06-15', defendantAbroad: true, stateParty: true }));
  assert.deepEqual(got, {
    service: '2026-10-30', // 15 June days + 45 from 16 Sep (1 Jul – 15 Sep suspended)
    interventions: '2027-01-08',
    interventionAfterNotice: '2027-02-08',
    pleadings: '2027-03-01',
    addendum: '2027-03-16',
    judgeAssignment: '2027-03-26',
    preliminaryOrder: '2027-04-26',
    hearingRequest: '2027-05-04', // 05-01 Sat … 05-03 Easter Monday → Tue
    vaguenessCompletion: '2027-04-16',
    vaguenessRebuttal: '2027-05-04',
    witnessEvaluation: '2027-05-05', // 27,28,29,(30 Good Friday),(3 Easter Monday),4,5
    witnessExamination: '2027-06-28',
    finalJudgment: '2028-01-07',
    resummons: '2027-07-26',
    hearing: '2027-04-26',
  });
});

// ---------------------------------------------------------------------------
// lawcase.gr fixtures — small claims (art. 468). The site computes `resummons` from "today"
// (2026-11-15) when no hearing is given; we omit it, so it is dropped from those fixtures.

const SITE_SMALL: Record<string, { input: SmallClaimsInput; site: Dates; override?: Dates }> = {
  m1_base: {
    input: { filingDate: '2026-06-15' },
    site: { service: '2026-06-25', evidenceAndMemo: '2026-07-15', rebuttal: '2026-07-20', interventions: '2026-07-06', interventionEvidence: '2026-09-04', interventionRebuttal: '2026-09-09' },
    // DEVIATION (468§3 εδ.γ summer): site counts 50 days (+August) for a domestic defendant; rule is filing + 30.
    override: { interventionEvidence: '2026-07-15', interventionRebuttal: '2026-07-20' },
  },
  m3_state: {
    input: { filingDate: '2026-06-15', stateParty: true },
    site: { service: '2026-06-25', evidenceAndMemo: '2026-09-30', rebuttal: '2026-10-05', interventions: '2026-09-21', interventionEvidence: '2026-10-20', interventionRebuttal: '2026-10-26' },
    // DEVIATION (468§3 εδ.γ summer): site counts 50 days; filing + 30 with 1 Jul – 15 Sep suspended = 09-30.
    override: { interventionEvidence: '2026-09-30', interventionRebuttal: '2026-10-05' },
  },
  m4_hearing: {
    input: { filingDate: '2026-06-15', hearingDate: '2026-11-20' },
    site: { service: '2026-06-25', evidenceAndMemo: '2026-07-15', rebuttal: '2026-07-20', interventions: '2026-07-06', interventionEvidence: '2026-09-04', interventionRebuttal: '2026-09-09', resummons: '2027-02-18', hearing: '2026-11-20' },
    // DEVIATION (468§3 εδ.γ summer): as m1.
    override: { interventionEvidence: '2026-07-15', interventionRebuttal: '2026-07-20' },
  },
  // December filing: the site uses the correct 30 days here (no deviation).
  m5_dec: {
    input: { filingDate: '2026-12-10' },
    site: { service: '2026-12-21', evidenceAndMemo: '2027-01-11', rebuttal: '2027-01-18', interventions: '2026-12-30', interventionEvidence: '2027-01-11', interventionRebuttal: '2027-01-18' },
  },
};

for (const [name, c] of Object.entries(SITE_SMALL)) {
  test(`lawcase.gr small claims ${name}`, () => {
    const got = dates(computeDeadlines('gr_small_claims', c.input));
    assert.deepEqual(got, { ...c.site, ...c.override });
  });
}

test('small claims m2_abroad (own expectations)', () => {
  // site: service 2026-07-15, evidenceAndMemo 2026-09-04, rebuttal 2026-09-09, interventions 2026-07-27 (all equal ours),
  // interventionEvidence 2026-10-14, interventionRebuttal 2026-10-19 (site counts 90 days; rule is 50).
  const r = computeDeadlines('gr_small_claims', { filingDate: '2026-06-15', defendantAbroad: true });
  assert.deepEqual(dates(r), {
    service: '2026-07-15',
    evidenceAndMemo: '2026-09-04',
    rebuttal: '2026-09-09',
    interventions: '2026-07-27',
    interventionEvidence: '2026-09-04', // 15 + 31 days, August skipped, + 4
    interventionRebuttal: '2026-09-09',
  });
  assert.equal(r.hearing, undefined);
});
