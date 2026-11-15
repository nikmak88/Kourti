import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { invokeNodeApi } from '@/lib/backendApi';
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  currentLanguage,
  setLanguage,
  type Language,
} from '@/i18n';

/**
 * EN / ΕΛ switch. Changes the UI immediately and saves the choice to the
 * user's profile (so it follows them to other devices and sets the language
 * of their emails). `persist={false}` for screens without a session (login).
 */
export function LanguageSwitcher({
  persist = true,
  compact = false,
}: {
  persist?: boolean;
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const onChange = async (value: string) => {
    const lang = value as Language;
    await setLanguage(lang);
    if (!persist) return;
    setSaving(true);
    try {
      await invokeNodeApi('/api/v1/users/me/language', { method: 'PATCH', body: { language: lang } });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Select value={currentLanguage()} onValueChange={onChange} disabled={saving} key={i18n.language}>
      <SelectTrigger
        className={compact ? 'h-8 w-[130px] gap-1 text-xs' : 'w-[200px]'}
        aria-label={t('language.label')}
      >
        <Globe className="h-4 w-4 shrink-0 opacity-70" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_NAMES[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default LanguageSwitcher;
