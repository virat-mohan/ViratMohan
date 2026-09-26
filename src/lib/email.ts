// Every email the site sends. Goes out from Virat's Gmail (GMAIL_ADDRESS) via
// the Gmail API; Resend is only a logged fallback when Gmail isn't configured.
// Over the daily guard (see mail/send.ts) the email waits in the outbox.
import { getEnv } from './env';
import { deliver, liveMailDeps, type Delivery, type MailEnv } from './mail/send';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export async function sendEmail(
  input: SendEmailInput,
  env: Partial<MailEnv> = {},
  opts: { onOverQuota?: 'enqueue' | 'throw' } = {},
): Promise<Delivery> {
  const e: MailEnv = { ...getEnv(), ...Object.fromEntries(Object.entries(env).filter(([, v]) => v)) };
  return deliver(input, await liveMailDeps(e), opts);
}
