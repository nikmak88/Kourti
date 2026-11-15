import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { invokeNodeApi } from '@/lib/backendApi';
import { currentLanguage, isLanguage, setLanguage } from '@/i18n';

/**
 * After sign-in, apply the language saved in the user's profile (the choice
 * made on another device wins over this browser's cached one). Renders nothing.
 */
export function LanguageSync() {
  const { user } = useAuth();
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    invokeNodeApi<{ profile?: { preferred_language?: string | null } | null }>('/api/v1/users/me')
      .then((me) => {
        const saved = me?.profile?.preferred_language;
        if (isLanguage(saved) && saved !== currentLanguage()) void setLanguage(saved);
      })
      .catch(() => {
        /* keep the current language */
      });
  }, [user?.id]);

  return null;
}

export default LanguageSync;
