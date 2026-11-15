import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

const CONSENT_KEY = 'kourti_cookie_consent';

declare global {
  interface Window {
    __kourtiInitAnalytics?: () => void;
    __kourtiAnalyticsInited?: boolean;
    clarity?: (...args: unknown[]) => void;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation('common');

  useEffect(() => {
    // No analytics in this build (self-hosted default) → nothing to consent to.
    if (import.meta.env.VITE_ANALYTICS_ENABLED !== 'true') return;
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
    window.__kourtiInitAnalytics?.();
  };

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
    // Opt out of Mixpanel and halt Microsoft Clarity session recording (M8).
    // Analytics init (__kourtiInitAnalytics) is only ever invoked on accept.
    window.mixpanel?.opt_out_tracking?.();
    window.clarity?.('consent', false);
    window.clarity?.('stop');
  };

  return (
    <div
      role="dialog"
      aria-label={t('cookies.label')}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm shadow-lg"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <Trans
              i18nKey="common:cookies.text"
              components={{
                link: (
                  <a
                    href="https://kourti.com/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:no-underline"
                  />
                ),
              }}
            />
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleReject}>
            {t('cookies.reject')}
          </Button>
          <Button size="sm" onClick={handleAccept}>
            {t('cookies.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
