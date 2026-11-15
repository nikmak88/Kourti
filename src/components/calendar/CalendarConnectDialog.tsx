import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { useCalendarSync } from '@/hooks/useCalendarSync';
import { toast } from 'sonner';
import { isSafeHttpsUrl, CALENDAR_OAUTH_ORIGINS } from '@/lib/safeUrl';
import { useTranslation } from 'react-i18next';

interface CalendarConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: 'google' | 'microsoft';
}

export function CalendarConnectDialog({
  open,
  onOpenChange,
  provider,
}: CalendarConnectDialogProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const { connectCalendar, isConnected } = useCalendarSync();
  const { t } = useTranslation('calendar');
  const providerName = provider === 'google' ? 'Google Calendar' : 'Microsoft Teams';
  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const authUrl = await connectCalendar.mutateAsync(provider);
      // Defense-in-depth: only redirect to a server-supplied OAuth URL when it
      // is https and on an expected Google/Microsoft origin.
      if (isSafeHttpsUrl(authUrl, CALENDAR_OAUTH_ORIGINS)) {
        window.location.href = authUrl;
      } else if (authUrl) {
        toast.error(t('connect.toast.failedTitle'), {
          description: t('connect.toast.unexpectedUrl'),
        });
        setIsConnecting(false);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : t('connect.toast.initiateFailed');
      toast.error(t('connect.toast.failedTitle'), { description: errorMessage });
      setIsConnecting(false);
    }
  };

  const connected = isConnected(provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('connect.title', { provider: providerName })}
          </DialogTitle>
          <DialogDescription>
            {t('connect.description', { provider: providerName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {connected ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>{t('connect.connected')}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('connect.redirectNotice')}
              </p>
              <Button onClick={handleConnect} disabled={isConnecting} className="w-full">
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('connect.connecting')}
                  </>
                ) : (
                  <>{t('connect.button', { provider: provider === 'google' ? 'Google' : 'Microsoft' })}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
