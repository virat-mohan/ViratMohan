/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Plain secrets, set as Vercel project environment variables (Settings >
// Environment Variables), read server-side via import.meta.env — no adapter
// bindings, no CLI setup.
interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly ANTHROPIC_API_KEY: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_EMAIL: string;
  readonly ADMIN_NOTIFY_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
