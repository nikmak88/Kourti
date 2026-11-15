import type { Request } from 'express';

import { env } from '../config/env.js';

export type UiLanguage = 'en' | 'el';

/** UI language of the request (the web app sends Accept-Language: en | el). */
export function requestLanguage(req: Request): UiLanguage {
  const header = String(req.headers['accept-language'] ?? '').toLowerCase();
  if (header.startsWith('el')) return 'el';
  if (header.startsWith('en')) return 'en';
  return env.DEFAULT_LANGUAGE;
}

/** System-prompt line telling the model which language to answer in. */
export function aiLanguageInstruction(lang: UiLanguage): string {
  return lang === 'el'
    ? 'Answer in Greek (Ελληνικά), in a formal professional register, unless the user explicitly asks for another language. Keep legal terms accurate for Greek/Cypriot practice and keep quotations from documents in their original language.'
    : 'Answer in English unless the user writes in or asks for another language.';
}
