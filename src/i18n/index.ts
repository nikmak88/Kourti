/**
 * UI translations (react-i18next).
 *
 * - Texts live in src/i18n/locales/<lang>/<namespace>.json, one namespace per
 *   area (common, nav, auth, matters, …). English is the source and the
 *   fallback: a key missing in Greek shows the English text.
 * - Components: `const { t } = useTranslation('matters')` then
 *   `t('list.title')`, or `t('common:actions.save')` for shared words.
 * - Language order: the user's choice (saved in their profile and cached in
 *   localStorage) → the install default (VITE_DEFAULT_LANGUAGE, set by
 *   install.sh --language) → English.
 * - Dates: use the helpers in ./dates so month/day names follow the language.
 *
 * See src/i18n/README.md for conventions.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['en', 'el'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  el: 'Ελληνικά',
};

const STORAGE_KEY = 'kourti.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function defaultLanguage(): Language {
  const fromEnv = import.meta.env.VITE_DEFAULT_LANGUAGE;
  return isLanguage(fromEnv) ? fromEnv : 'en';
}

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return defaultLanguage();
}

// Every locales/<lang>/<ns>.json file, bundled at build time.
const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;
const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  (resources[lang] ??= {})[ns] = mod.default;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  defaultNS: 'common',
  ns: Object.keys(resources.en ?? { common: {} }),
  interpolation: { escapeValue: false }, // React already escapes
});

function applyDocumentLanguage(lang: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

/** Switch the UI language and remember it on this device. */
export async function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  await i18n.changeLanguage(lang);
}

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

export default i18n;
