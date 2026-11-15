import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { BellRing, Loader2, MonitorSmartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { invokeNodeApi } from '@/lib/backendApi';
import {
  REMINDER_CHANNELS,
  TASK_TYPES,
  TASK_TYPE_SETTINGS_KEY,
  reminderDefaultFor,
  useTaskTypeSettings,
  type ReminderChannel,
  type TaskTypeSetting,
} from '@/lib/taskTypes';
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '@/lib/webPush';

/**
 * Settings → Task types: the default reminder of each task type (firm admins),
 * and browser push for the current browser (every user).
 * Backend: /api/v1/task-types and /api/v1/push (routes/api/taskTypes.ts).
 * New tasks of a type start with its default; each task can change it.
 */
export default function TaskTypesTab() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { data, isLoading } = useTaskTypeSettings();
  const canManage = data?.can_manage ?? false;

  const save = async (type: string, value: Omit<TaskTypeSetting, 'task_type'>) => {
    try {
      await invokeNodeApi(`/api/v1/task-types/${type}`, { method: 'PUT', body: value });
      queryClient.invalidateQueries({ queryKey: TASK_TYPE_SETTINGS_KEY });
    } catch (err) {
      toast.error(t('common:errors.saveFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('common:status.loading')}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-muted-foreground">{t('taskTypes.intro')}</p>

      <PushCard />

      <div className="divide-y rounded-md border">
        {TASK_TYPES.map((type) => (
          <TaskTypeRow
            key={type}
            type={type}
            value={reminderDefaultFor(data?.settings, type)}
            disabled={!canManage}
            onSave={(v) => save(type, v)}
          />
        ))}
      </div>
      {!canManage && <p className="text-xs text-muted-foreground">{t('taskTypes.adminOnly')}</p>}
    </div>
  );
}

function TaskTypeRow({
  type,
  value,
  disabled,
  onSave,
}: {
  type: string;
  value: Omit<TaskTypeSetting, 'task_type'>;
  disabled: boolean;
  onSave: (v: Omit<TaskTypeSetting, 'task_type'>) => void;
}) {
  const { t } = useTranslation('settings');
  const [days, setDays] = useState(value.reminder_days);
  useEffect(() => setDays(value.reminder_days), [value.reminder_days]);

  const update = (patch: Partial<Omit<TaskTypeSetting, 'task_type'>>) => onSave({ ...value, ...patch });
  const toggleChannel = (ch: ReminderChannel, on: boolean) => {
    const next = on
      ? Array.from(new Set([...value.reminder_channels, ch]))
      : value.reminder_channels.filter((c) => c !== ch);
    if (next.length) update({ reminder_channels: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2 text-sm">
      <span className="w-56 font-medium">{t(`tasks:types.${type}`)}</span>
      <label className="flex items-center gap-2">
        <Switch
          checked={value.reminder_enabled}
          disabled={disabled}
          onCheckedChange={(v) => update({ reminder_enabled: v })}
        />
        {t('taskTypes.reminder')}
      </label>
      {value.reminder_enabled && (
        <>
          <span className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              className="h-8 w-20"
              value={days}
              disabled={disabled}
              onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
              onBlur={() => days !== value.reminder_days && update({ reminder_days: days })}
            />
            {t('tasks:reminder.daysBefore', { count: days })}
          </span>
          {REMINDER_CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-2">
              <Checkbox
                checked={value.reminder_channels.includes(ch)}
                disabled={disabled}
                onCheckedChange={(v) => toggleChannel(ch, v === true)}
              />
              {t(`tasks:reminder.channels.${ch}`)}
            </label>
          ))}
        </>
      )}
    </div>
  );
}

function PushCard() {
  const { t } = useTranslation('settings');
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const run = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch (err) {
      toast.error(t('common:toast.error'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
      <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
      <div className="min-w-[14rem] flex-1">
        <p className="font-medium">{t('taskTypes.push.title')}</p>
        <p className="text-xs text-muted-foreground">{state ? t(`taskTypes.push.state.${state}`) : '…'}</p>
      </div>
      {state === 'off' && (
        <Button size="sm" onClick={() => run(enablePush)} disabled={busy}>
          <BellRing className="mr-1 h-4 w-4" /> {t('taskTypes.push.enable')}
        </Button>
      )}
      {state === 'on' && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const n = await sendTestPush(t('taskTypes.push.testTitle'), t('taskTypes.push.testBody')).catch(() => 0);
              if (!n) toast.error(t('taskTypes.push.testFailed'));
            }}
          >
            {t('taskTypes.push.test')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run(disablePush)} disabled={busy}>
            {t('taskTypes.push.disable')}
          </Button>
        </>
      )}
    </div>
  );
}
