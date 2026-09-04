// Vercel serverless functions guarantee env vars via process.env at request
// time. import.meta.env.X gets statically inlined by Vite at build time,
// which is unreliable for secrets set later in the Vercel dashboard — so
// every /devshop/api and /devshop/admin route reads through this instead.
export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  ADMIN_NOTIFY_EMAIL: string;
  // Reply-to-email feedback loop
  INBOUND_EMAIL_DOMAIN: string; // e.g. "reply.viratmohan.com" — must be configured for Resend Inbound
  RESEND_WEBHOOK_SECRET: string; // Resend webhook signing secret (Svix-based)
};

export function getEnv(): Env {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? '',
    ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL ?? '',
    INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN ?? '',
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET ?? '',
  };
}
