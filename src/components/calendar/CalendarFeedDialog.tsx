import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Download, Link2, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { invokeNodeApi } from '@/lib/backendApi';

interface FeedLink {
  url: string;
  webcal: string;
}

/**
 * The user's private calendar feed (backend: routes/api/calendarFeed.ts) for
 * subscribing from Outlook, Apple Calendar or Google Calendar.
 */
export function CalendarFeedDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('calendar');
  const [link, setLink] = useState<FeedLink | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || link) return;
    invokeNodeApi<FeedLink>('/api/v1/calendar-feed-link')
      .then(setLink)
      .catch((err) => toast.error(t('common:toast.error'), { description: (err as Error).message }));
  }, [open, link, t]);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url).catch(() => undefined);
    toast.success(t('feed.copied'));
  };

  const reset = async () => {
    if (!window.confirm(t('feed.resetConfirm'))) return;
    setBusy(true);
    try {
      setLink(await invokeNodeApi<FeedLink>('/api/v1/calendar-feed-link/reset', { method: 'POST' }));
      toast.success(t('feed.resetDone'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> {t('feed.title')}
          </DialogTitle>
          <DialogDescription>{t('feed.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex gap-2">
            <Input readOnly value={link?.url ?? ''} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={copy} disabled={!link} aria-label={t('feed.copy')}>
              {link ? <Copy className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild disabled={!link}>
              <a href={link?.webcal ?? '#'}>{t('feed.subscribe')}</a>
            </Button>
            <Button size="sm" variant="outline" asChild disabled={!link}>
              <a href={link?.url ?? '#'} download="kourti.ics">
                <Download className="mr-1 h-4 w-4" /> {t('feed.download')}
              </a>
            </Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t('feed.howOutlook')}</li>
            <li>{t('feed.howGoogle')}</li>
            <li>{t('feed.contents')}</li>
            <li>{t('feed.private')}</li>
          </ul>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy || !link}>
            <RefreshCw className="mr-1 h-4 w-4" /> {t('feed.reset')}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
