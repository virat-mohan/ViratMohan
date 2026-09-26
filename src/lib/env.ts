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
  ADMIN_PASSWORD: string; // gates /devshop/admin/* — see src/middleware.ts
  // Retail OS deposit collection by UPI until a payment gateway is chosen.
  RETAIL_OS_UPI_ID: string; // e.g. devshop@okicici
  RETAIL_OS_UPI_PAYEE: string; // name shown in the payer's UPI app
  RETAIL_OS_UPI_QR_URL: string; // image URL of DevShop's static UPI QR
  RETAIL_OS_WHATSAPP_NUMBER: string; // DevShop's WhatsApp for payment screenshots, digits with country code
  CRON_SECRET: string; // Vercel sends it as a Bearer token to scheduled routes
  // Weekly settlement and payouts (src/pages/api/cron/settle.ts)
  PAYOUTS_ENABLED: string; // 'true' to move money; anything else is dry-run
  PAYOUT_CAP_PER_PAYOUT_INR: string; // whole rupees; unset → every payout is held
  PAYOUT_CAP_WEEKLY_INR: string; // whole rupees across all brands; unset → held
  RAZORPAYX_KEY_ID: string;
  RAZORPAYX_KEY_SECRET: string;
  RAZORPAYX_ACCOUNT_NUMBER: string; // RazorpayX business account payouts debit from
  RAZORPAYX_WEBHOOK_SECRET: string;
  // WhatsApp Cloud API (src/pages/api/whatsapp/webhook.ts, notify())
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_PAYOUT_TEMPLATE: string; // approved template name for "payout sent" outside the 24h window
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
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? '',
    RETAIL_OS_UPI_ID: process.env.RETAIL_OS_UPI_ID ?? '',
    RETAIL_OS_UPI_PAYEE: process.env.RETAIL_OS_UPI_PAYEE ?? '',
    RETAIL_OS_UPI_QR_URL: process.env.RETAIL_OS_UPI_QR_URL ?? '',
    RETAIL_OS_WHATSAPP_NUMBER: process.env.RETAIL_OS_WHATSAPP_NUMBER ?? '',
    CRON_SECRET: process.env.CRON_SECRET ?? '',
    PAYOUTS_ENABLED: process.env.PAYOUTS_ENABLED ?? 'false',
    PAYOUT_CAP_PER_PAYOUT_INR: process.env.PAYOUT_CAP_PER_PAYOUT_INR ?? '',
    PAYOUT_CAP_WEEKLY_INR: process.env.PAYOUT_CAP_WEEKLY_INR ?? '',
    RAZORPAYX_KEY_ID: process.env.RAZORPAYX_KEY_ID ?? '',
    RAZORPAYX_KEY_SECRET: process.env.RAZORPAYX_KEY_SECRET ?? '',
    RAZORPAYX_ACCOUNT_NUMBER: process.env.RAZORPAYX_ACCOUNT_NUMBER ?? '',
    RAZORPAYX_WEBHOOK_SECRET: process.env.RAZORPAYX_WEBHOOK_SECRET ?? '',
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET ?? '',
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN ?? '',
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    WHATSAPP_PAYOUT_TEMPLATE: process.env.WHATSAPP_PAYOUT_TEMPLATE ?? '',
  };
}
