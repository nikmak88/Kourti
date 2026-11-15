import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { invokeNodeApi } from '@/lib/backendApi';
import type { DeadlineOption } from '@/components/tasks/TaskDialog';

/**
 * Procedural deadlines of a matter (backend: routes/api/deadlines.ts, engine
 * backend-node/src/lib/deadlines). Only matters whose type has a rule set
 * (Settings → Matter types → Deadlines) get any.
 */
export type DeadlineRules = 'gr_ordinary' | 'gr_small_claims';

export interface ProcedureInputs {
  filing_date?: string | null;
  defendant_abroad?: boolean;
  state_party?: boolean;
  summons?: boolean;
  incidental?: boolean;
}

export interface DeadlineNote {
  kind: 'suspension' | 'weekend' | 'holiday';
  from: string;
  to: string;
  days?: number;
  reason?: 'august' | 'state_summer';
  holiday?: string;
}

export interface Deadline {
  key: string;
  date: string;
  nominalDate: string;
  rule: { days?: number; months?: number; workingDays?: number; base: string; direction: 'after' | 'before' };
  article: string;
  notes: DeadlineNote[];
  kind: 'party' | 'court' | 'backward';
}

export interface CaseDeadlines {
  rules: DeadlineRules | null;
  inputs?: ProcedureInputs;
  defaults?: ProcedureInputs;
  stored?: boolean;
  hearing_date?: string | null;
  missing?: string[];
  deadlines?: Deadline[];
  hearing?: { date: string; estimated: boolean };
}

export function useCaseDeadlines(caseId?: string) {
  return useQuery({
    queryKey: ['case-deadlines', caseId],
    queryFn: () => invokeNodeApi<CaseDeadlines>(`/api/v1/case-deadlines/${caseId}`),
    enabled: !!caseId,
  });
}

export function useSaveCaseDeadlineInputs(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProcedureInputs & { hearing_date?: string | null }) =>
      invokeNodeApi<CaseDeadlines>(`/api/v1/case-deadlines/${caseId}`, { method: 'PUT', body }),
    onSuccess: (data) => {
      queryClient.setQueryData(['case-deadlines', caseId], data);
      // The hearing date is also the matter's "next hearing" (matter page, calendar).
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });
}

/** Deadlines as options for the task dialog (translated labels). */
export function useDeadlineOptions(caseId?: string): DeadlineOption[] {
  const { t } = useTranslation('deadlines');
  const { data } = useCaseDeadlines(caseId);
  return (data?.deadlines ?? []).map((d) => ({ key: d.key, label: t(`keys.${d.key}`), date: d.date }));
}

export interface DeadlineSetting {
  case_type_id: string;
  rules: DeadlineRules;
  defaults: ProcedureInputs;
}

export function useDeadlineSettings() {
  return useQuery({
    queryKey: ['deadline-settings'],
    queryFn: () =>
      invokeNodeApi<{ settings: DeadlineSetting[]; can_manage: boolean }>('/api/v1/deadline-settings'),
    staleTime: 5 * 60 * 1000,
  });
}
