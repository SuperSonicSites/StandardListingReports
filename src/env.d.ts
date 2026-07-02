/// <reference types="astro/client" />

// Server-side secrets/config read from `.env`. Astro/Vite exposes `.env` values on
// `import.meta.env` (NOT `process.env`), so the adapters read import.meta.env with a
// process.env fallback for real hosting environment variables. Declaring them here keeps
// those reads type-safe under `astro/tsconfigs/strict`.
interface ImportMetaEnv {
  readonly RYBBIT_API_KEY?: string;
  readonly RYBBIT_API_URL?: string;
  readonly META_SYSTEM_USER_TOKEN?: string;
  readonly CHROME_PATH?: string;
  readonly DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
