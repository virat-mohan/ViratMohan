/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Runtime } from '@astrojs/cloudflare';

// Plain secrets, set as Cloudflare Pages environment variables (dashboard —
// Settings > Environment variables), not Cloudflare bindings. No wrangler
// CLI or D1/KV setup needed.
type CloudflareEnv = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  ADMIN_NOTIFY_EMAIL: string;
};

declare namespace App {
  interface Locals extends Runtime<CloudflareEnv> {}
}
