import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, CheckSquare, ListChecks, Loader2, Quote, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { invokeNodeApi } from '@/lib/backendApi';
import { formatDate } from '@/i18n/dates';
import { useAuth } from '@/hooks/useAuth';
import { useDeadlineOptions } from '@/hooks/useCaseDeadlines';
import { TASK_TYPES } from '@/lib/taskTypes';

// Filing tasks (Κατάθεση …) without a date from the recording take the matter's
// computed filing deadline, as in the task dialog (components/tasks/TaskDialog).
const FILING_TASK_TYPES = new Set(['deposition', 'filing']);
const FILING_DEADLINE_KEYS = ['pleadings', 'evidenceAndMemo'];

/**
 * "Extract tasks & events" for a voice-note transcript.
 *
 * The AI only PROPOSES items (POST /api/v1/ai/transcript-actions). The user
 * reviews and edits them here, and only the ticked ones are created through
 * the normal tasks / calendar APIs. Tasks must belong to a matter; events may.
 */

type Priority = 'high' | 'medium' | 'low';
// API values - only the displayed label is translated (voice:eventTypes.*).
const EVENT_TYPES = ['meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation'];

interface ProposedTask {
  selected: boolean;
  title: string;
  description: string;
  due_date: string | null;
  priority: Priority;
  assigned_to: string | null;
  task_type: string;
  /** Computed procedural deadline used as due date (filing tasks on deadline matters). */
  deadline_key?: string;
  source_quote: string;
}

interface ProposedEvent {
  selected: boolean;
  title: string;
  description: string;
  event_type: string;
  start: string; // YYYY-MM-DDTHH:MM (local) or YYYY-MM-DD (all-day)
  end: string | null;
  all_day: boolean;
  location: string | null;
  source_quote: string;
}

interface ExtractResponse {
  suggested_case_id: string | null;
  matter_reason: string;
  reference_date: string;
  tasks: Omit<ProposedTask, 'selected'>[];
  events: Omit<ProposedEvent, 'selected'>[];
  matters: Array<{ id: string; label: string }>;
  staff: Array<{ id: string; name: string }>;
  modelUsed?: string;
}

const NONE = 'none';
const UNASSIGNED = 'unassigned';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local "YYYY-MM-DDTHH:MM" / "YYYY-MM-DD" → ISO start/end for the calendar API. */
function eventRange(ev: ProposedEvent): { start: string; end: string } {
  if (ev.all_day) {
    const day = ev.start.slice(0, 10);
    return {
      start: new Date(`${day}T00:00`).toISOString(),
      end: new Date(`${day}T23:59`).toISOString(),
    };
  }
  const start = new Date(ev.start);
  const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

interface Props {
  transcript: string;
  /** Matter already chosen on the page ("Link to matter"), if any. */
  initialCaseId?: string | null;
  /** Recording title, used in item descriptions. */
  sourceTitle?: string;
}

const TranscriptActions: React.FC<Props> = ({ transcript, initialCaseId, sourceTitle }) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('voice');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [data, setData] = useState<ExtractResponse | null>(null);
  const [caseId, setCaseId] = useState<string>(NONE);
  const [tasks, setTasks] = useState<ProposedTask[]>([]);
  const [events, setEvents] = useState<ProposedEvent[]>([]);
  const { user } = useAuth();
  const deadlineOptions = useDeadlineOptions(caseId === NONE ? undefined : caseId);
  const filingDeadline = deadlineOptions.find((d) => FILING_DEADLINE_KEYS.includes(d.key));

  // Fill empty due dates of filing tasks once the matter's deadlines are known.
  useEffect(() => {
    if (!filingDeadline) return;
    setTasks((prev) =>
      prev.map((task) =>
        FILING_TASK_TYPES.has(task.task_type) && !task.due_date
          ? { ...task, due_date: filingDeadline.date, deadline_key: filingDeadline.key }
          : task
      )
    );
  }, [filingDeadline?.key, filingDeadline?.date]);

  const extract = async () => {
    setIsExtracting(true);
    try {
      const res = await invokeNodeApi<ExtractResponse>('/api/v1/ai/transcript-actions', {
        method: 'POST',
        body: {
          transcript,
          case_id: initialCaseId && initialCaseId !== NONE ? initialCaseId : null,
          reference_date: localToday(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setData(res);
      setCaseId(res.suggested_case_id ?? NONE);
      // Nobody named → the task is the user's own (as for tasks created by hand).
      setTasks(res.tasks.map((task) => ({ ...task, assigned_to: task.assigned_to ?? user?.id ?? null, selected: true })));
      setEvents(res.events.map((e) => ({ ...e, selected: true })));
      if (!res.tasks.length && !res.events.length) {
        toast.info(t('actions.toast.nothingTitle'), {
          description: t('actions.toast.nothingDescription'),
        });
      }
    } catch (err: unknown) {
      toast.error(t('actions.toast.extractFailed'), {
        description: err instanceof Error ? err.message : t('actions.toast.extractFailedDescription'),
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const selectedTasks = tasks.filter((task) => task.selected);
  const selectedEvents = events.filter((e) => e.selected);
  const needsMatter = selectedTasks.length > 0 && caseId === NONE;

  const createSelected = async () => {
    if (needsMatter) {
      toast.error(t('actions.chooseMatter'), { description: t('actions.tasksNeedMatter') });
      return;
    }
    setIsCreating(true);
    const matter = caseId === NONE ? undefined : caseId;
    // Written into the created task/event descriptions (shown to users later).
    const origin = sourceTitle
      ? t('actions.fromVoiceNote', { title: sourceTitle })
      : t('actions.fromVoiceNoteUntitled');
    let created = 0;
    const failures: string[] = [];

    for (const task of selectedTasks) {
      try {
        await invokeNodeApi('/api/v1/tasks', {
          method: 'POST',
          body: {
            case_id: matter,
            title: task.title,
            description: [task.description, task.source_quote && `${origin}: “${task.source_quote}”`]
              .filter(Boolean)
              .join('\n\n'),
            due_date: task.due_date || undefined,
            priority: task.priority,
            // 'unassigned' (not null): the backend strips nulls from bodies.
            assigned_to: task.assigned_to || 'unassigned',
            task_type: task.task_type || 'general',
            deadline_key: task.deadline_key || undefined,
            // No reminder fields: the backend applies the type's default reminder.
          },
        });
        created++;
      } catch (err) {
        failures.push(
          t('actions.taskFailed', {
            title: task.title,
            error: err instanceof Error ? err.message : t('actions.failed'),
          })
        );
      }
    }

    for (const e of selectedEvents) {
      try {
        const { start, end } = eventRange(e);
        await invokeNodeApi('/api/v1/calendar/events', {
          method: 'POST',
          body: {
            title: e.title,
            start_date: start,
            end_date: end,
            description: [e.description, e.source_quote && `${origin}: “${e.source_quote}”`]
              .filter(Boolean)
              .join('\n\n'),
            location: e.location || undefined,
            event_type: e.event_type,
            case_id: matter,
          },
        });
        created++;
      } catch (err) {
        failures.push(
          t('actions.eventFailed', {
            title: e.title,
            error: err instanceof Error ? err.message : t('actions.failed'),
          })
        );
      }
    }

    if (matter) queryClient.invalidateQueries({ queryKey: ['tasks', matter] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    setIsCreating(false);

    if (failures.length) {
      toast.error(t('actions.toast.createFailed', { count: failures.length }), {
        description: failures.slice(0, 3).join('\n'),
      });
    }
    if (created) {
      toast.success(t('actions.toast.created', { count: created }), {
        description: matter
          ? t('actions.toast.createdWithMatter')
          : t('actions.toast.createdEventsOnly'),
      });
      // Remove what was created; keep unticked / failed ones for another pass.
      setTasks((prev) => prev.filter((task) => !task.selected));
      setEvents((prev) => prev.filter((e) => !e.selected));
    }
  };

  const updateTask = (i: number, patch: Partial<ProposedTask>) =>
    setTasks((prev) => prev.map((task, idx) => (idx === i ? { ...task, ...patch } : task)));
  const updateEvent = (i: number, patch: Partial<ProposedEvent>) =>
    setEvents((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  if (!data) {
    return (
      <Button
        onClick={extract}
        disabled={isExtracting || !transcript.trim()}
        variant="outline"
        className="flex items-center space-x-2"
      >
        {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span>{isExtracting ? t('actions.extracting') : t('actions.extract')}</span>
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <ListChecks className="h-4 w-4" /> {t('actions.proposedTitle')}
        </h3>
        <Button variant="ghost" size="sm" onClick={extract} disabled={isExtracting}>
          {isExtracting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          {t('actions.extractAgain')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('actions.proposedHelp', {
          date:
            formatDate(`${data.reference_date.slice(0, 10)}T00:00`, 'PP') || data.reference_date,
        })}
      </p>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('common:entities.matter')}</label>
        <Select value={caseId} onValueChange={setCaseId}>
          <SelectTrigger>
            <SelectValue placeholder={t('actions.chooseMatter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('actions.noMatter')}</SelectItem>
            {data.matters.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.suggested_case_id && data.matter_reason && (
          <p className="text-xs text-muted-foreground">
            {t('actions.suggestedByAi', { reason: data.matter_reason })}
          </p>
        )}
        {needsMatter && (
          <p className="text-xs text-destructive">{t('actions.tasksNeedMatter')}</p>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4" /> {t('common:entities.tasks')}
          </h4>
          {tasks.map((task, i) => (
            <div key={`t${i}`} className="space-y-2 rounded border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={task.selected}
                  onCheckedChange={(v) => updateTask(i, { selected: v === true })}
                  className="mt-2"
                  aria-label={t('actions.createThisTask')}
                />
                <Input value={task.title} onChange={(e) => updateTask(i, { title: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2 lg:grid-cols-4">
                <Select value={task.task_type} onValueChange={(v) => updateTask(i, { task_type: v })}>
                  <SelectTrigger aria-label={t('tasks:dialog.typeLabel')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`tasks:types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={task.due_date ?? ''}
                  onChange={(e) => updateTask(i, { due_date: e.target.value || null, deadline_key: undefined })}
                  aria-label={t('common:time.dueDate')}
                  title={task.deadline_key ? t(`deadlines:keys.${task.deadline_key}`) : undefined}
                />
                <Select value={task.priority} onValueChange={(v) => updateTask(i, { priority: v as Priority })}>
                  <SelectTrigger aria-label={t('common:fields.priority')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">{t('actions.priority.high')}</SelectItem>
                    <SelectItem value="medium">{t('actions.priority.medium')}</SelectItem>
                    <SelectItem value="low">{t('actions.priority.low')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={task.assigned_to ?? UNASSIGNED}
                  onValueChange={(v) => updateTask(i, { assigned_to: v === UNASSIGNED ? null : v })}
                >
                  <SelectTrigger aria-label={t('actions.assignee')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>{t('actions.unassigned')}</SelectItem>
                    {data.staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {task.source_quote && (
                <p className="flex gap-1 pl-6 text-xs italic text-muted-foreground">
                  <Quote className="h-3 w-3 shrink-0" /> {task.source_quote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarPlus className="h-4 w-4" /> {t('actions.calendarEvents')}
          </h4>
          {events.map((e, i) => (
            <div key={`e${i}`} className="space-y-2 rounded border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={e.selected}
                  onCheckedChange={(v) => updateEvent(i, { selected: v === true })}
                  className="mt-2"
                  aria-label={t('actions.createThisEvent')}
                />
                <Input value={e.title} onChange={(ev) => updateEvent(i, { title: ev.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                <Select value={e.event_type} onValueChange={(v) => updateEvent(i, { event_type: v })}>
                  <SelectTrigger aria-label={t('actions.eventType')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {t(`eventTypes.${et}`, { defaultValue: et })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {e.all_day ? (
                  <Input
                    type="date"
                    value={e.start.slice(0, 10)}
                    onChange={(ev) => updateEvent(i, { start: ev.target.value })}
                    aria-label={t('common:time.date')}
                  />
                ) : (
                  <Input
                    type="datetime-local"
                    value={e.start}
                    onChange={(ev) => updateEvent(i, { start: ev.target.value })}
                    aria-label={t('common:time.start')}
                  />
                )}
                <Input
                  placeholder={t('actions.location')}
                  value={e.location ?? ''}
                  onChange={(ev) => updateEvent(i, { location: ev.target.value || null })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {e.all_day && <Badge variant="secondary">{t('common:time.allDay')}</Badge>}
                {e.source_quote && (
                  <p className="flex gap-1 text-xs italic text-muted-foreground">
                    <Quote className="h-3 w-3 shrink-0" /> {e.source_quote}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tasks.length + events.length > 0 ? (
        <Button
          onClick={createSelected}
          disabled={isCreating || selectedTasks.length + selectedEvents.length === 0 || needsMatter}
          className="flex items-center space-x-2"
        >
          {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
          <span>
            {t('actions.createSelected', {
              tasks: t('actions.taskCount', { count: selectedTasks.length }),
              events: t('actions.eventCount', { count: selectedEvents.length }),
            })}
          </span>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('actions.nothingLeft')}</p>
      )}
    </div>
  );
};

export default TranscriptActions;
