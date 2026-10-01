/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_POWERSYNC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Version de la app, inyectada al compilar (vite.config.ts, ver 0025).
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILD__: string
