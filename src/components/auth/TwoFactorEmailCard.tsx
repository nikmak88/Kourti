import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getEmailOtpSetting, setEmailOtpSetting } from '@/lib/authClient';

export function TwoFactorEmailCard() {
  const { t } = useTranslation('auth');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getEmailOtpSetting()
      .then((res) => {
        if (mounted) setEnabled(res.enabled);
      })
      .catch(() => {
        if (mounted) setEnabled(true); // default-on assumption
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = (next: boolean) => {
    setPendingValue(next);
    setPassword('');
  };

  const handleConfirm = async () => {
    if (pendingValue === null) return;
    if (!password) {
      toast.error(t('twoFactor.enterPassword'));
      return;
    }
    setSaving(true);
    const { enabled: newEnabled, error } = await setEmailOtpSetting(pendingValue, password);
    setSaving(false);
    if (error) {
      toast.error(error.message || t('twoFactor.updateFailed'));
      return;
    }
    setEnabled(newEnabled);
    setPendingValue(null);
    setPassword('');
    toast.success(newEnabled ? t('twoFactor.enabledToast') : t('twoFactor.disabledToast'));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('twoFactor.title')}</CardTitle>
        <CardDescription>{t('twoFactor.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('twoFactor.label')}</p>
            <p className="text-xs text-muted-foreground">
              {enabled === null
                ? t('common:status.loading')
                : enabled
                  ? t('twoFactor.enabledHelp')
                  : t('twoFactor.disabledHelp')}
            </p>
          </div>
          <Switch
            checked={pendingValue ?? enabled ?? false}
            disabled={enabled === null || saving}
            onCheckedChange={handleToggle}
          />
        </div>

        {pendingValue !== null && pendingValue !== enabled && (
          <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
            <Label htmlFor="emailotp-password">{t('twoFactor.confirmLabel')}</Label>
            <Input
              id="emailotp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('twoFactor.currentPasswordPlaceholder')}
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={saving || !password}>
                {saving
                  ? t('common:status.saving')
                  : pendingValue
                    ? t('twoFactor.enable')
                    : t('twoFactor.disable')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPendingValue(null);
                  setPassword('');
                }}
                disabled={saving}
              >
                {t('common:actions.cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
