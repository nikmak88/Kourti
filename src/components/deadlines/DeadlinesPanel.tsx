import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/i18n/dates';
import { TaskDialog } from '@/components/tasks/TaskDialog';
import {
  useCaseDeadlines,
  useDeadlineOptions,
  useSaveCaseDeadlineInputs,
  type Deadline,
  type DeadlineNote,
  type ProcedureInputs,
} from '@/hooks/useCaseDeadlines';

const FLAGS_ORDINARY = ['defendant_abroad', 'state_party', 'summons', 'incidental'] as const;
const FLAGS_SMALL = ['defendant_abroad', 'state_party'] as const;

const day = (d: string, fmt = 'EEE d MMM yyyy') => formatDate(`${d}T00:00:00`, fmt);

/**
 * "Procedural deadlines" card on the matter page, for matters whose type has a
 * rule set (Αστικό - Νέα Τακτική, Αστικό - Μικροδιαφορές …). The inputs start
 * from the type's defaults; every deadline can become a task.
 */
export function DeadlinesPanel({ caseId }: { caseId: string }) {
  const { t } = useTranslation('deadlines');
  const { data, isLoading } = useCaseDeadlines(caseId);
  const save = useSaveCaseDeadlineInputs(caseId);
  const options = useDeadlineOptions(caseId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProcedureInputs & { hearing_date?: string | null }>({});
  const [taskFor, setTaskFor] = useState<string | null>(null);

  useEffect(() => {
    if (data?.rules) {
      setForm({ ...data.inputs, hearing_date: data.hearing_date ?? '' });
      // Open the inputs straight away while the filing date is missing.
      if (!data.inputs?.filing_date) setEditing(true);
    }
  }, [data]);

  if (isLoading || !data?.rules) return null;
  const flags = data.rules === 'gr_ordinary' ? FLAGS_ORDINARY : FLAGS_SMALL;

  const submit = () =>
    save.mutate(
      {
        // '' (not null) clears a date: the backend strips nulls from bodies.
        filing_date: form.filing_date || '',
        defendant_abroad: !!form.defendant_abroad,
        state_party: !!form.state_party,
        summons: !!form.summons,
        incidental: !!form.incidental,
        hearing_date: form.hearing_date || '',
      },
      {
        onSuccess: (r) => setEditing(!r.inputs?.filing_date),
        onError: (err) => toast.error(t('common:errors.saveFailed'), { description: (err as Error).message }),
      }
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" /> {t('title')}
          <Badge variant="secondary" className="font-normal">
            {t(`rules.${data.rules}`)}
          </Badge>
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {t('panel.edit')} {editing ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('inputs.filing_date')} *</span>
                <Input
                  type="date"
                  value={form.filing_date ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, filing_date: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">{t('inputs.hearing_date')}</span>
                <Input
                  type="date"
                  value={form.hearing_date ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, hearing_date: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {flags.map((flag) => (
                <label key={flag} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!form[flag]}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, [flag]: v === true }))}
                  />
                  {t(`inputs.${flag}`)}
                </label>
              ))}
            </div>
            <Button size="sm" onClick={submit} disabled={save.isPending || !form.filing_date}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t('panel.save')}
            </Button>
          </div>
        )}

        {data.missing?.includes('filing_date') ? (
          <p className="text-sm text-muted-foreground">{t('panel.missingFiling')}</p>
        ) : (
          <>
            {data.hearing && (
              <p className="text-sm">
                {data.hearing.estimated
                  ? t('panel.estimatedHearing', { date: day(data.hearing.date) })
                  : t('panel.knownHearing', { date: day(data.hearing.date) })}
              </p>
            )}
            <ul className="divide-y rounded-md border">
              {(data.deadlines ?? []).map((d) => (
                <DeadlineRow key={d.key} d={d} onAddTask={() => setTaskFor(d.key)} />
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t('panel.disclaimer')}</p>
          </>
        )}
      </CardContent>

      <TaskDialog
        open={!!taskFor}
        onOpenChange={(o) => !o && setTaskFor(null)}
        caseId={caseId}
        deadlines={options}
        presetDeadlineKey={taskFor ?? undefined}
      />
    </Card>
  );
}

function DeadlineRow({ d, onAddTask }: { d: Deadline; onAddTask: () => void }) {
  const { t } = useTranslation('deadlines');
  const [open, setOpen] = useState(false);
  const past = d.date < new Date().toISOString().slice(0, 10);

  const base =
    d.rule.base === 'filing' || d.rule.base === 'hearing'
      ? t(`rule.base_${d.rule.base}`)
      : t(`keys.${d.rule.base}`);
  const rule =
    d.rule.workingDays != null
      ? t('rule.after_workingDays', { days: d.rule.workingDays, base })
      : d.rule.months != null
        ? t('rule.after_months', { months: d.rule.months, base })
        : t(d.rule.direction === 'before' ? 'rule.before_days' : 'rule.after_days', { days: d.rule.days, base });

  const note = (n: DeadlineNote) =>
    n.kind === 'suspension'
      ? t(`notes.suspension_${n.reason ?? 'august'}`, { days: n.days, from: day(n.from, 'd MMM'), to: day(n.to, 'd MMM yyyy') })
      : n.kind === 'holiday'
        ? t('notes.holiday', { from: day(n.from), to: day(n.to), name: t(`holidays.${n.holiday}`, { defaultValue: n.holiday }) })
        : t('notes.weekend', { from: day(n.from), to: day(n.to) });

  return (
    <li className={`px-3 py-2 text-sm ${past ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <span className="font-medium">{t(`keys.${d.key}`)}</span>
        </button>
        <span className="tabular-nums font-semibold">{day(d.date)}</span>
        <Button size="sm" variant="outline" className="h-7" onClick={onAddTask}>
          <Plus className="mr-1 h-3 w-3" /> {t('panel.addTask')}
        </Button>
      </div>
      {open && (
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>
            {d.article} · {rule}
          </p>
          {d.notes.map((n, i) => (
            <p key={i}>↪ {note(n)}</p>
          ))}
        </div>
      )}
    </li>
  );
}
