import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { CaseIssue } from '../types';

/**
 * Issues of a matter type. By default only the ones offered for new matters;
 * includeRetired also returns issues the firm removed (flagged `retired`), so
 * an existing matter can still show its issue name.
 */
export const useCaseIssues = (caseTypeId?: string, options?: { includeRetired?: boolean }) => {
  const includeRetired = options?.includeRetired ?? false;
  return useQuery({
    queryKey: ['case-issues', caseTypeId, { includeRetired }],
    queryFn: async (): Promise<CaseIssue[]> => {
      if (!caseTypeId) {
        return [];
      }

      const data = await invokeNodeApi<CaseIssue[]>('/api/v1/misc/case-issues', {
        query: includeRetired ? { caseTypeId, includeRetired: 'true' } : { caseTypeId },
      });

      return data || [];
    },
    enabled: !!caseTypeId,
  });
};
