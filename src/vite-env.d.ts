/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_SIGNUP_ENABLED?: string;
  /** Default UI language for users without a saved choice: 'en' | 'el'. */
  readonly VITE_DEFAULT_LANGUAGE?: string;
  /** 'true' loads Microsoft Clarity / Mixpanel after cookie consent (off for self-hosted). */
  readonly VITE_ANALYTICS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
