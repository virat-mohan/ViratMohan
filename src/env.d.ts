/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Runtime } from '@astrojs/cloudflare';

type CloudflareEnv = {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  ADMIN_NOTIFY_EMAIL: string;
};

declare namespace App {
  interface Locals extends Runtime<CloudflareEnv> {}
}
