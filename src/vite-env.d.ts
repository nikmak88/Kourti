/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_SIGNUP_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
