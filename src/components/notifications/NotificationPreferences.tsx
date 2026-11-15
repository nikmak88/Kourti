import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotificationsDb';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Bell, Mail, Smartphone, Save } from 'lucide-react';
import { toast } from 'sonner';

export function NotificationPreferences() {
  const { data: organizationId } = useUserOrganization();
  const { data: preferences, isLoading } = useNotificationPreferences(organizationId || '');
  const updatePreferences = useUpdateNotificationPreferences();
  const { t } = useTranslation('notifications');
  const [formData, setFormData] = useState({
    email_enabled: true,
    email_frequency: 'immediate' as 'immediate' | 'daily' | 'weekly' | 'never',
    in_app_enabled: true,
    case_notifications: true,
    client_notifications: true,
    document_notifications: true,
    contract_notifications: true,
    calendar_notifications: true,
    task_notifications: true,
    invoice_notifications: true,
    general_notifications: true,
  });

  useEffect(() => {
    if (preferences) {
      setFormData({
        email_enabled: preferences.email_enabled ?? true,
        email_frequency: preferences.email_frequency ?? 'immediate',
        in_app_enabled: preferences.in_app_enabled ?? true,
        case_notifications: preferences.case_notifications ?? true,
        client_notifications: preferences.client_notifications ?? true,
        document_notifications: preferences.document_notifications ?? true,
        contract_notifications: preferences.contract_notifications ?? true,
        calendar_notifications: preferences.calendar_notifications ?? true,
        task_notifications: preferences.task_notifications ?? true,
        invoice_notifications: preferences.invoice_notifications ?? true,
        general_notifications: preferences.general_notifications ?? true,
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    if (!organizationId) {
      toast.error(t('common:toast.error'), { description: t('preferences.toast.noOrganization') });
      return;
    }

    try {
      await updatePreferences.mutateAsync({
        organization_id: organizationId,
        ...formData,
      });
      toast.success(t('common:toast.success'), { description: t('preferences.toast.saved') });
    } catch {
      toast.error(t('common:toast.error'), { description: t('preferences.toast.saveFailed') });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('preferences.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">{t('preferences.loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('preferences.title')}
        </CardTitle>
        <CardDescription>{t('preferences.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">{t('settings.email.title')}</h3>
          </div>
          <div className="space-y-4 pl-7">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-enabled">{t('preferences.email.enable')}</Label>
                <p className="text-sm text-muted-foreground">{t('preferences.email.enableHelp')}</p>
              </div>
              <Switch
                id="email-enabled"
                checked={formData.email_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, email_enabled: checked })}
              />
            </div>
            {formData.email_enabled && (
              <div className="space-y-2">
                <Label htmlFor="email-frequency">{t('preferences.email.frequency')}</Label>
                <Select
                  value={formData.email_frequency}
                  onValueChange={(value: 'immediate' | 'daily' | 'weekly' | 'never') =>
                    setFormData({ ...formData, email_frequency: value })
                  }
                >
                  <SelectTrigger id="email-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">{t('preferences.frequency.immediate')}</SelectItem>
                    <SelectItem value="daily">{t('preferences.frequency.daily')}</SelectItem>
                    <SelectItem value="weekly">{t('preferences.frequency.weekly')}</SelectItem>
                    <SelectItem value="never">{t('preferences.frequency.never')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* In-App Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">{t('preferences.inApp.title')}</h3>
          </div>
          <div className="pl-7">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="in-app-enabled">{t('preferences.inApp.enable')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('preferences.inApp.enableHelp')}
                </p>
              </div>
              <Switch
                id="in-app-enabled"
                checked={formData.in_app_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, in_app_enabled: checked })}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Notification Types */}
        <div className="space-y-4">
          <h3 className="font-semibold">{t('preferences.types.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('preferences.types.description')}
          </p>
          <div className="space-y-3">
            <NotificationTypeToggle
              label={t('preferences.types.case.label')}
              description={t('preferences.types.case.description')}
              checked={formData.case_notifications}
              onChange={(checked) => setFormData({ ...formData, case_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.client.label')}
              description={t('preferences.types.client.description')}
              checked={formData.client_notifications}
              onChange={(checked) => setFormData({ ...formData, client_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.document.label')}
              description={t('preferences.types.document.description')}
              checked={formData.document_notifications}
              onChange={(checked) => setFormData({ ...formData, document_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.contract.label')}
              description={t('preferences.types.contract.description')}
              checked={formData.contract_notifications}
              onChange={(checked) => setFormData({ ...formData, contract_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.calendar.label')}
              description={t('preferences.types.calendar.description')}
              checked={formData.calendar_notifications}
              onChange={(checked) => setFormData({ ...formData, calendar_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.task.label')}
              description={t('preferences.types.task.description')}
              checked={formData.task_notifications}
              onChange={(checked) => setFormData({ ...formData, task_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.invoice.label')}
              description={t('preferences.types.invoice.description')}
              checked={formData.invoice_notifications}
              onChange={(checked) => setFormData({ ...formData, invoice_notifications: checked })}
            />
            <NotificationTypeToggle
              label={t('preferences.types.general.label')}
              description={t('preferences.types.general.description')}
              checked={formData.general_notifications}
              onChange={(checked) => setFormData({ ...formData, general_notifications: checked })}
            />
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updatePreferences.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updatePreferences.isPending ? t('common:status.saving') : t('preferences.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationTypeToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
