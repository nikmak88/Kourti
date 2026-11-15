import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, CalendarClock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateTask, useUpdateTask } from '@/hooks/useTasks';
import { useOrganizationMembers } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/i18n/dates';
import {
  REMINDER_CHANNELS,
  TASK_TYPES,
  reminderDefaultFor,
  useTaskTypeSettings,
  type ReminderChannel,
} from '@/lib/taskTypes';

/** A computed procedural deadline offered as the task's due date (lib/deadlines). */
export interface DeadlineOption {
  key: string;
  label: string;
  date: string; // YYYY-MM-DD
}

// Task types whose default due date is a computed filing deadline (Κατάθεση…),
// and which deadline that is for each rule set.
const FILING_TASK_TYPES = new Set(['deposition', 'filing']);
const FILING_DEADLINE_KEYS = ['pleadings', 'evidenceAndMemo'];

const UNASSIGNED = 'unassigned';

interface FormState {
  title: string;
  description: string;
  due_date: string;
  priority: string;
  assigned_to: string;
  task_type: string;
  deadline_key: string | null;
  reminder_enabled: boolean;
  reminder_days: number;
  reminder_channels: ReminderChannel[];
}

/**
 * Create / edit a matter task. New tasks are assigned to their creator, get
 * the firm's default reminder for their type (Settings → Task types), and -
 * on matters with procedural deadlines - can take their due date from one of
 * the computed deadlines.
 */
export function TaskDialog({
  open,
  onOpenChange,
  caseId,
  existing,
  deadlines = [],
  presetDeadlineKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  existing?: any;
  deadlines?: DeadlineOption[];
  /** Open a new task prefilled from this deadline (the matter's deadline list). */
  presetDeadlineKey?: string;
}) {
  const isEdit = !!existing;
  const { t } = useTranslation('tasks');
  const { user } = useAuth();
  const { data: users = [] } = useOrganizationMembers();
  const { data: typeSettings } = useTaskTypeSettings();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [submitting, setSubmitting] = useState(false);

  const blank = useMemo((): FormState => {
    const preset = deadlines.find((d) => d.key === presetDeadlineKey);
    const type = preset ? 'filing' : 'general';
    return {
      title: preset ? preset.label : '',
      description: '',
      due_date: preset?.date ?? '',
      priority: 'medium',
      assigned_to: user?.id ?? UNASSIGNED,
      task_type: type,
      deadline_key: preset?.key ?? null,
      ...reminderDefaultFor(typeSettings?.settings, type),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetDeadlineKey, user?.id, typeSettings, deadlines.length]);

  const fromExisting = (): FormState => ({
    title: existing.title ?? '',
    description: existing.description ?? '',
    due_date: existing.due_date ? String(existing.due_date).substring(0, 10) : '',
    priority: existing.priority ?? 'medium',
    assigned_to: existing.assigned_to ?? UNASSIGNED,
    task_type: existing.task_type ?? 'general',
    deadline_key: existing.deadline_key ?? null,
    reminder_enabled: !!existing.reminder_enabled,
    reminder_days: existing.reminder_days ?? 1,
    reminder_channels: existing.reminder_channels?.length ? existing.reminder_channels : ['in_app'],
  });

  const [form, setForm] = useState<FormState>(() => (existing ? fromExisting() : blank));

  // Reset a new-task form each time the dialog opens (settings may load late).
  useEffect(() => {
    if (open && !isEdit) setForm(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blank]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const applyDeadline = (key: string | null) => {
    const d = deadlines.find((x) => x.key === key);
    setForm((prev) => ({ ...prev, deadline_key: d?.key ?? null, due_date: d ? d.date : prev.due_date }));
  };

  const changeType = (type: string) => {
    setForm((prev) => {
      const next: FormState = { ...prev, task_type: type };
      if (!isEdit) Object.assign(next, reminderDefaultFor(typeSettings?.settings, type));
      // Κατάθεση on a matter with computed deadlines: default to the filing deadline.
      if (!isEdit && FILING_TASK_TYPES.has(type) && !prev.deadline_key) {
        const d = deadlines.find((x) => FILING_DEADLINE_KEYS.includes(x.key));
        if (d) Object.assign(next, { deadline_key: d.key, due_date: d.date });
      }
      return next;
    });
  };

  const toggleChannel = (ch: ReminderChannel, on: boolean) =>
    set(
      'reminder_channels',
      on ? Array.from(new Set([...form.reminder_channels, ch])) : form.reminder_channels.filter((c) => c !== ch)
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      title: form.title,
      description: form.description,
      due_date: form.due_date || undefined,
      priority: form.priority,
      task_type: form.task_type,
      // Sentinels, not null: the backend strips nulls from request bodies.
      assigned_to: form.assigned_to,
      deadline_key: form.deadline_key ?? '',
      reminder_enabled: form.reminder_enabled && !!form.due_date,
      reminder_days: form.reminder_days,
      reminder_channels: form.reminder_channels.length ? form.reminder_channels : ['in_app'],
      case_id: caseId,
    };
    const done = {
      onSuccess: () => {
        setSubmitting(false);
        onOpenChange(false);
      },
      onError: () => setSubmitting(false),
    };
    if (isEdit) updateTask.mutate({ ...(payload as any), id: existing.id }, done);
    else createTask.mutate(payload as any, done);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" id="task-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('dialog.titleLabel')} *</label>
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder={t('dialog.titlePlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('dialog.typeLabel')}</label>
              <Select value={form.task_type} onValueChange={changeType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('dialog.typePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`types.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {deadlines.length > 0 && (
              <div className="md:col-span-2">
                <label className="mb-2 flex items-center gap-1 text-sm font-medium">
                  <CalendarClock className="h-4 w-4" /> {t('dialog.deadlineLabel')}
                </label>
                <Select value={form.deadline_key ?? 'none'} onValueChange={(v) => applyDeadline(v === 'none' ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('dialog.deadlineNone')}</SelectItem>
                    {deadlines.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label} - {formatDate(`${d.date}T00:00:00`, 'PP')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">{t('common:time.dueDate')}</label>
              <Input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value, deadline_key: null }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('common:fields.priority')}</label>
              <Select value={form.priority} onValueChange={(v) => set('priority', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">{t('dialog.priorityOption.high')}</SelectItem>
                  <SelectItem value="medium">{t('dialog.priorityOption.medium')}</SelectItem>
                  <SelectItem value="low">{t('dialog.priorityOption.low')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">{t('dialog.assignTo')}</label>
              <Select value={form.assigned_to} onValueChange={(v) => set('assigned_to', v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('dialog.assigneePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>{t('unassigned')}</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reminder */}
            <div className="md:col-span-2 rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="task-reminder" className="flex items-center gap-2">
                  <BellRing className="h-4 w-4" /> {t('reminder.label')}
                </Label>
                <Switch
                  id="task-reminder"
                  checked={form.reminder_enabled}
                  onCheckedChange={(v) => set('reminder_enabled', v)}
                  disabled={!form.due_date}
                />
              </div>
              {!form.due_date && <p className="text-xs text-muted-foreground">{t('reminder.needsDueDate')}</p>}
              {form.reminder_enabled && form.due_date && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      className="h-8 w-20"
                      value={form.reminder_days}
                      onChange={(e) => set('reminder_days', Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                    />
                    <span>{t('reminder.daysBefore', { count: form.reminder_days })}</span>
                  </div>
                  {REMINDER_CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-2">
                      <Checkbox
                        checked={form.reminder_channels.includes(ch)}
                        onCheckedChange={(v) => toggleChannel(ch, v === true)}
                      />
                      {t(`reminder.channels.${ch}`)}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">{t('common:fields.description')}</label>
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder={t('dialog.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="task-form" disabled={submitting}>
            {submitting ? t('common:status.saving') : isEdit ? t('dialog.saveChanges') : t('dialog.submitCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
