import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Task types (stored in tasks.task_type). Labels: tasks:types.<value> and
 * tasks:typesShort.<value>. Each firm can give a type a default reminder in
 * Settings → Task types (backend: routes/api/taskTypes.ts).
 */
export const TASK_TYPES = [
  'general',
  'court_appearance',
  'client_visit',
  'document_review',
  'research',
  'filing',
  'deposition',
  'meeting',
  'phone_call',
  'investigation',
  'negotiation',
  'contract_draft',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

/** Reminder channels (services/taskReminders.ts). Labels: tasks:reminder.channels.<value>. */
export const REMINDER_CHANNELS = ['in_app', 'email', 'push'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export interface TaskTypeSetting {
  task_type: string;
  reminder_enabled: boolean;
  reminder_days: number;
  reminder_channels: ReminderChannel[];
}

export const TASK_TYPE_SETTINGS_KEY = ['task-type-settings'];

export function useTaskTypeSettings() {
  return useQuery({
    queryKey: TASK_TYPE_SETTINGS_KEY,
    queryFn: () =>
      invokeNodeApi<{ settings: TaskTypeSetting[]; can_manage: boolean }>('/api/v1/task-types'),
    staleTime: 5 * 60 * 1000,
  });
}

/** The firm's default reminder for a type (disabled when none is set). */
export function reminderDefaultFor(
  settings: TaskTypeSetting[] | undefined,
  type: string
): Pick<TaskTypeSetting, 'reminder_enabled' | 'reminder_days' | 'reminder_channels'> {
  const s = settings?.find((x) => x.task_type === type);
  return s
    ? { reminder_enabled: s.reminder_enabled, reminder_days: s.reminder_days, reminder_channels: s.reminder_channels }
    : { reminder_enabled: false, reminder_days: 1, reminder_channels: ['in_app'] };
}
