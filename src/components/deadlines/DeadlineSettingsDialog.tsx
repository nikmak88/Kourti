import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { invokeNodeApi } from '@/lib/backendApi';
import { useDeadlineSettings, type DeadlineRules, type ProcedureInputs } from '@/hooks/useCaseDeadlines';

const FLAGS = {
  gr_ordinary: ['defendant_abroad', 'state_party', 'summons', 'incidental'],
  gr_small_claims: ['defendant_abroad', 'state_party'],
} as const;

/**
 * Settings → Matter types → "Deadlines" on a type: which rule set computes the
 * procedural deadlines of its matters, and the default inputs for new matters
 * (backend: PUT /api/v1/deadline-settings/:caseTypeId).
 */
export function DeadlineSettingsDialog({
  caseType,
  onClose,
}: {
  caseType: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('deadlines');
  const queryClient = useQueryClient();
  const { data } = useDeadlineSettings();
  const current = data?.settings.find((s) => s.case_type_id === caseType?.id);
  const [rules, setRules] = useState<DeadlineRules | 'none'>('none');
  const [defaults, setDefaults] = useState<ProcedureInputs>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules(current?.rules ?? 'none');
    setDefaults(current?.defaults ?? {});
  }, [current, caseType?.id]);

  const save = async () => {
    if (!caseType) return;
    setSaving(true);
    try {
      await invokeNodeApi(`/api/v1/deadline-settings/${caseType.id}`, {
        method: 'PUT',
        body: { rules, defaults },
      });
      queryClient.invalidateQueries({ queryKey: ['deadline-settings'] });
      queryClient.invalidateQueries({ queryKey: ['case-deadlines'] });
      toast.success(t('settings.saved'));
      onClose();
    } catch (err) {
      toast.error(t('common:errors.saveFailed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!caseType} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('settings.title', { type: caseType?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={rules} onValueChange={(v) => setRules(v as DeadlineRules | 'none')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('rules.none')}</SelectItem>
              <SelectItem value="gr_ordinary">{t('rules.gr_ordinary')}</SelectItem>
              <SelectItem value="gr_small_claims">{t('rules.gr_small_claims')}</SelectItem>
            </SelectContent>
          </Select>
          {rules !== 'none' && (
            <div className="space-y-2">
              <Label>{t('settings.defaults')}</Label>
              {FLAGS[rules].map((flag) => (
                <label key={flag} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!defaults[flag]}
                    onCheckedChange={(v) => setDefaults((d) => ({ ...d, [flag]: v === true }))}
                  />
                  {t(`inputs.${flag}`)}
                </label>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t('common:actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
