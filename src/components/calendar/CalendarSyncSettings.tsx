import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Settings, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { CalendarConnectDialog } from './CalendarConnectDialog';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/i18n/dates';

export function CalendarSyncSettings() {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'microsoft' | null>(null);
  const { integrations, updateSyncSettings, disconnectCalendar, triggerSync, isLoading } =
    useCalendarSync();
  const { t } = useTranslation('calendar');
  const handleConnect = (provider: 'google' | 'microsoft') => {
    setSelectedProvider(provider);
    setConnectDialogOpen(true);
  };

  const handleDisconnect = async (provider: 'google' | 'microsoft') => {
    try {
      await disconnectCalendar.mutateAsync(provider);
      toast.success(t('sync.toast.disconnectedTitle'), {
        description: t('sync.toast.disconnectedDescription', {
          provider: provider === 'google' ? 'Google' : 'Microsoft',
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('sync.toast.disconnectFailed');
      toast.error(t('common:toast.error'), { description: errorMessage });
    }
  };

  const handleSyncNow = async (provider: 'google' | 'microsoft') => {
    try {
      await triggerSync.mutateAsync(provider);
      toast.success(t('sync.toast.startedTitle'), {
        description: t('sync.toast.startedDescription', {
          provider: provider === 'google' ? 'Google' : 'Microsoft',
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t('sync.toast.startFailed');
      toast.error(t('common:toast.error'), { description: errorMessage });
    }
  };

  const googleIntegration = integrations?.find((i) => i.provider === 'google');
  const microsoftIntegration = integrations?.find((i) => i.provider === 'microsoft');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t('sync.title')}
        </CardTitle>
        <CardDescription>{t('sync.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Google Calendar */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <Label className="text-lg font-semibold">Google Calendar</Label>
              {googleIntegration ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('connect.connected')}
                </Badge>
              ) : (
                <Badge variant="outline">{t('sync.notConnected')}</Badge>
              )}
            </div>
            {googleIntegration ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncNow('google')}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('sync.syncNow')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDisconnect('google')}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('sync.disconnect')}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => handleConnect('google')}>
                {t('sync.connect')}
              </Button>
            )}
          </div>

          {googleIntegration && (
            <div className="space-y-4 pl-7">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('sync.enableSync')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('sync.enableSyncHelp', { provider: 'Google Calendar' })}
                  </p>
                </div>
                <Switch
                  checked={googleIntegration.sync_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateSyncSettings.mutate({
                      provider: 'google',
                      sync_enabled: checked,
                    })
                  }
                />
              </div>

              {googleIntegration.sync_enabled && (
                <div className="space-y-2">
                  <Label>{t('sync.direction')}</Label>
                  <Select
                    value={googleIntegration.sync_direction || 'bidirectional'}
                    onValueChange={(value: 'import' | 'export' | 'bidirectional') =>
                      updateSyncSettings.mutate({
                        provider: 'google',
                        sync_direction: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">{t('sync.directions.import')}</SelectItem>
                      <SelectItem value="export">{t('sync.directions.export')}</SelectItem>
                      <SelectItem value="bidirectional">{t('sync.directions.bidirectional')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {googleIntegration.last_sync_at && (
                <p className="text-sm text-muted-foreground">
                  {t('sync.lastSynced', { date: formatDate(googleIntegration.last_sync_at, 'Pp') })}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Microsoft Teams */}
        <div className="space-y-4 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <Label className="text-lg font-semibold">Microsoft Teams</Label>
              {microsoftIntegration ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {t('connect.connected')}
                </Badge>
              ) : (
                <Badge variant="outline">{t('sync.notConnected')}</Badge>
              )}
            </div>
            {microsoftIntegration ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSyncNow('microsoft')}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('sync.syncNow')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDisconnect('microsoft')}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('sync.disconnect')}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => handleConnect('microsoft')}>
                {t('sync.connect')}
              </Button>
            )}
          </div>

          {microsoftIntegration && (
            <div className="space-y-4 pl-7">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t('sync.enableSync')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('sync.enableSyncHelp', { provider: 'Microsoft Teams' })}
                  </p>
                </div>
                <Switch
                  checked={microsoftIntegration.sync_enabled ?? true}
                  onCheckedChange={(checked) =>
                    updateSyncSettings.mutate({
                      provider: 'microsoft',
                      sync_enabled: checked,
                    })
                  }
                />
              </div>

              {microsoftIntegration.sync_enabled && (
                <div className="space-y-2">
                  <Label>{t('sync.direction')}</Label>
                  <Select
                    value={microsoftIntegration.sync_direction || 'bidirectional'}
                    onValueChange={(value: 'import' | 'export' | 'bidirectional') =>
                      updateSyncSettings.mutate({
                        provider: 'microsoft',
                        sync_direction: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="import">{t('sync.directions.import')}</SelectItem>
                      <SelectItem value="export">{t('sync.directions.export')}</SelectItem>
                      <SelectItem value="bidirectional">{t('sync.directions.bidirectional')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {microsoftIntegration.last_sync_at && (
                <p className="text-sm text-muted-foreground">
                  {t('sync.lastSynced', { date: formatDate(microsoftIntegration.last_sync_at, 'Pp') })}
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>

      <CalendarConnectDialog
        open={connectDialogOpen}
        onOpenChange={setConnectDialogOpen}
        provider={selectedProvider || 'google'}
      />
    </Card>
  );
}
