export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(
  input: SendEmailInput,
  env: { RESEND_API_KEY: string; RESEND_FROM_EMAIL: string }
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body.slice(0, 500)}`);
  }
}
