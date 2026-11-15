import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

/**
 * "Extract tasks & events" for a voice-note transcript.
 *
 * The AI only PROPOSES items (POST /api/v1/ai/transcript-actions). The user
 * reviews and edits them here, and only the ticked ones are created through
 * the normal tasks / calendar APIs. Tasks must belong to a matter; events may.
 */

type Priority = 'high' | 'medium' | 'low';
const EVENT_TYPES = ['meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation'];

interface ProposedTask {
  selected: boolean;
  title: string;
  description: string;
  due_date: string | null;
  priority: Priority;
  assigned_to: string | null;
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
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [data, setData] = useState<ExtractResponse | null>(null);
  const [caseId, setCaseId] = useState<string>(NONE);
  const [tasks, setTasks] = useState<ProposedTask[]>([]);
  const [events, setEvents] = useState<ProposedEvent[]>([]);

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
      setTasks(res.tasks.map((t) => ({ ...t, selected: true })));
      setEvents(res.events.map((e) => ({ ...e, selected: true })));
      if (!res.tasks.length && !res.events.length) {
        toast.info('Nothing to extract', {
          description: 'No tasks or dated events were found in this transcript.',
        });
      }
    } catch (err: unknown) {
      toast.error('Extraction failed', {
        description: err instanceof Error ? err.message : 'Could not analyse the transcript',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const selectedTasks = tasks.filter((t) => t.selected);
  const selectedEvents = events.filter((e) => e.selected);
  const needsMatter = selectedTasks.length > 0 && caseId === NONE;

  const createSelected = async () => {
    if (needsMatter) {
      toast.error('Choose a matter', { description: 'Tasks must be attached to a matter.' });
      return;
    }
    setIsCreating(true);
    const matter = caseId === NONE ? undefined : caseId;
    const origin = sourceTitle ? `From voice note "${sourceTitle}"` : 'From voice note';
    let created = 0;
    const failures: string[] = [];

    for (const t of selectedTasks) {
      try {
        await invokeNodeApi('/api/v1/tasks', {
          method: 'POST',
          body: {
            case_id: matter,
            title: t.title,
            description: [t.description, t.source_quote && `${origin}: “${t.source_quote}”`]
              .filter(Boolean)
              .join('\n\n'),
            due_date: t.due_date || undefined,
            priority: t.priority,
            assigned_to: t.assigned_to || undefined,
            task_type: 'voice_note',
          },
        });
        created++;
      } catch (err) {
        failures.push(`Task "${t.title}": ${err instanceof Error ? err.message : 'failed'}`);
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
        failures.push(`Event "${e.title}": ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    if (matter) queryClient.invalidateQueries({ queryKey: ['tasks', matter] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    setIsCreating(false);

    if (failures.length) {
      toast.error(`${failures.length} item(s) could not be created`, {
        description: failures.slice(0, 3).join('\n'),
      });
    }
    if (created) {
      toast.success(`Created ${created} item(s)`, {
        description: matter
          ? 'Added to the matter and the calendar.'
          : 'Events were added to the calendar.',
      });
      // Remove what was created; keep unticked / failed ones for another pass.
      setTasks((prev) => prev.filter((t) => !t.selected));
      setEvents((prev) => prev.filter((e) => !e.selected));
    }
  };

  const updateTask = (i: number, patch: Partial<ProposedTask>) =>
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
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
        <span>{isExtracting ? 'Extracting…' : 'Extract tasks & events'}</span>
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <ListChecks className="h-4 w-4" /> Proposed tasks & events
        </h3>
        <Button variant="ghost" size="sm" onClick={extract} disabled={isExtracting}>
          {isExtracting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
          Extract again
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        AI proposals from the transcript (dates resolved from {data.reference_date}). Check and edit
        them; only ticked items are created.
      </p>

      <div className="space-y-1">
        <label className="text-sm font-medium">Matter</label>
        <Select value={caseId} onValueChange={setCaseId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a matter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No matter (events only)</SelectItem>
            {data.matters.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.suggested_case_id && data.matter_reason && (
          <p className="text-xs text-muted-foreground">Suggested by AI: {data.matter_reason}</p>
        )}
        {needsMatter && (
          <p className="text-xs text-destructive">Tasks must be attached to a matter.</p>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CheckSquare className="h-4 w-4" /> Tasks
          </h4>
          {tasks.map((t, i) => (
            <div key={`t${i}`} className="space-y-2 rounded border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={t.selected}
                  onCheckedChange={(v) => updateTask(i, { selected: v === true })}
                  className="mt-2"
                  aria-label="Create this task"
                />
                <Input value={t.title} onChange={(e) => updateTask(i, { title: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                <Input
                  type="date"
                  value={t.due_date ?? ''}
                  onChange={(e) => updateTask(i, { due_date: e.target.value || null })}
                  aria-label="Due date"
                />
                <Select value={t.priority} onValueChange={(v) => updateTask(i, { priority: v as Priority })}>
                  <SelectTrigger aria-label="Priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High priority</SelectItem>
                    <SelectItem value="medium">Medium priority</SelectItem>
                    <SelectItem value="low">Low priority</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={t.assigned_to ?? UNASSIGNED}
                  onValueChange={(v) => updateTask(i, { assigned_to: v === UNASSIGNED ? null : v })}
                >
                  <SelectTrigger aria-label="Assignee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {data.staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {t.source_quote && (
                <p className="flex gap-1 pl-6 text-xs italic text-muted-foreground">
                  <Quote className="h-3 w-3 shrink-0" /> {t.source_quote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarPlus className="h-4 w-4" /> Calendar events
          </h4>
          {events.map((e, i) => (
            <div key={`e${i}`} className="space-y-2 rounded border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={e.selected}
                  onCheckedChange={(v) => updateEvent(i, { selected: v === true })}
                  className="mt-2"
                  aria-label="Create this event"
                />
                <Input value={e.title} onChange={(ev) => updateEvent(i, { title: ev.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                <Select value={e.event_type} onValueChange={(v) => updateEvent(i, { event_type: v })}>
                  <SelectTrigger aria-label="Event type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {et.charAt(0).toUpperCase() + et.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {e.all_day ? (
                  <Input
                    type="date"
                    value={e.start.slice(0, 10)}
                    onChange={(ev) => updateEvent(i, { start: ev.target.value })}
                    aria-label="Date"
                  />
                ) : (
                  <Input
                    type="datetime-local"
                    value={e.start}
                    onChange={(ev) => updateEvent(i, { start: ev.target.value })}
                    aria-label="Start"
                  />
                )}
                <Input
                  placeholder="Location"
                  value={e.location ?? ''}
                  onChange={(ev) => updateEvent(i, { location: ev.target.value || null })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-6">
                {e.all_day && <Badge variant="secondary">All day</Badge>}
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
            Create {selectedTasks.length} task(s) and {selectedEvents.length} event(s)
          </span>
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing left to create.</p>
      )}
    </div>
  );
};

export default TranscriptActions;
