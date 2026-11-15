import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Contract types of the firm (backend: routes/api/contractTypes.ts, managed in
 * Settings → Contract types).
 *
 * contracts.contract_type stores the type's `name`. Built-in defaults have a
 * `key` and an English name; show them with contractTypeLabel() so they appear
 * in the user's language. The firm's own types are shown as entered.
 */
export interface ContractType {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  removed: boolean;
  contract_count: number;
}

export const CONTRACT_TYPES_QUERY_KEY = ['contract-types'];

export function useContractTypes() {
  return useQuery({
    queryKey: CONTRACT_TYPES_QUERY_KEY,
    queryFn: () =>
      invokeNodeApi<{ types: ContractType[]; can_manage: boolean }>('/api/v1/contract-types'),
    staleTime: 5 * 60 * 1000,
  });
}

// English names of the built-in defaults → label key, so a stored value can be
// translated even before the list has loaded (e.g. in contract lists).
const DEFAULT_KEYS: Record<string, string> = {
  'service agreement': 'service',
  'non-disclosure agreement': 'nda',
  'employment contract': 'employment',
  'purchase agreement': 'purchase',
  'lease agreement': 'lease',
  'partnership agreement': 'partnership',
  'licensing agreement': 'licensing',
  'consulting agreement': 'consulting',
  'supply agreement': 'supply',
  'distribution agreement': 'distribution',
};

/** Display label of a contract type (an object or the stored name). */
export function contractTypeLabel(
  t: TFunction,
  type: Pick<ContractType, 'key' | 'name'> | string | null | undefined
): string {
  if (!type) return '';
  const name = typeof type === 'string' ? type : type.name;
  const key = (typeof type === 'string' ? null : type.key) ?? DEFAULT_KEYS[name.trim().toLowerCase()];
  return key ? t(`common:contractTypes.${key}`, { defaultValue: name }) : name;
}

/**
 * Options for a contract-type picker: the firm's active types, plus `current`
 * (the contract's stored value) when it is retired/hidden or not in the list.
 * `value` is the stored name.
 */
export function useContractTypeOptions(current?: string | null) {
  const { t } = useTranslation();
  const { data, isLoading } = useContractTypes();
  const options = useMemo(() => {
    const types = data?.types ?? [];
    const list = types
      .filter((ct) => !ct.removed)
      .map((ct) => ({ value: ct.name, label: contractTypeLabel(t, ct) }));
    if (current && !list.some((o) => o.value.toLowerCase() === current.toLowerCase())) {
      list.push({ value: current, label: contractTypeLabel(t, current) });
    }
    return list;
  }, [data, current, t]);
  return { options, isLoading };
}
