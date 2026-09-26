export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../../../../lib/env';
import { getOrigin } from '../../../../lib/http';
import { serviceDb } from '../../../../lib/ledger';
import { escapeHtml } from '../../../../lib/retail-os-http';
import { calmPage } from '../../../../lib/calm-page';
import { authUrl, exchangeCode, fetchGmail, GMAIL_SCOPES, sealToken } from '../../../../lib/mail/gmail';

// One-time "Connect Gmail" (behind admin auth: /api/admin is protected in src/middleware.ts).
// Google hands back a refresh token; it is sealed with GMAIL_TOKEN_KEY and stored in
// gmail_credentials (RLS on, service role only). Nobody copies tokens by hand.
const COOKIE = 'vm_gmail_state';
const title = 'Connect Gmail';

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const env = getEnv();
  const redirectUri = `${getOrigin(request)}/api/admin/gmail/connect`;
  const missing = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_ADDRESS', 'GMAIL_TOKEN_KEY'].filter((k) => !(env as Record<string, string>)[k]);
  if (missing.length) {
    return calmPage({ title, eyebrow: 'Almost there', heading: 'Connect Gmail', status: 503,
      body: `<p>Add these in Vercel first, then come back to this page:</p><p>${missing.map((m) => `<code>${m}</code>`).join(' ')}</p><p class="small">Redirect URI to register in Google Cloud: <code>${escapeHtml(redirectUri)}</code></p>` });
  }
  const sb = serviceDb(env);
  const mailbox = env.GMAIL_ADDRESS.toLowerCase();

  const err = url.searchParams.get('error');
  if (err) return calmPage({ title, heading: 'Not connected', body: `<p>Google said: ${escapeHtml(err)}. Nothing was saved.</p><p><a class="btn" href="/api/admin/gmail/connect">Try again</a></p>`, status: 400 });

  const code = url.searchParams.get('code');
  if (code) {
    const want = cookies.get(COOKIE)?.value ?? '';
    const got = url.searchParams.get('state') ?? '';
    cookies.delete(COOKIE, { path: '/api/admin/gmail' });
    if (!want || want.length !== got.length || !timingSafeEqual(Buffer.from(want), Buffer.from(got))) {
      return calmPage({ title, heading: 'Link expired', body: '<p>That sign-in did not start here, so I ignored it. Start again below.</p><p><a class="btn" href="/api/admin/gmail/connect">Connect Gmail</a></p>', status: 400 });
    }
    try {
      const { refreshToken, scope } = await exchangeCode({ clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, code, redirectUri });
      if (!refreshToken) throw new Error('Google returned no refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
      const who = await fetchGmail({ clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken, address: mailbox }).profile();
      if (who.emailAddress.toLowerCase() !== mailbox) throw new Error(`You signed in as ${who.emailAddress}, but the site sends as ${mailbox}. Sign in with ${mailbox}.`);
      const missingScopes = GMAIL_SCOPES.filter((s) => !scope.includes(s));
      if (missingScopes.length) throw new Error('Some permissions were not ticked. Connect again and allow all three.');
      const { error } = await sb.from('gmail_credentials').upsert({ mailbox, refresh_token_sealed: sealToken(refreshToken, env.GMAIL_TOKEN_KEY), scopes: scope, connected_at: new Date().toISOString() }, { onConflict: 'mailbox' });
      if (error) throw new Error(`Could not save: ${error.message}`);
      return calmPage({ title, eyebrow: 'Connected', heading: 'Gmail is connected', body: `<p>Every email from the site now leaves from <b>${escapeHtml(mailbox)}</b>, and lead replies are read from the same inbox.</p><p>Nothing is sent to a lead without your approval.</p><p><a class="quiet" href="/retail-os/admin/leads">Go to leads</a></p>` });
    } catch (e) {
      return calmPage({ title, heading: 'Not connected', body: `<p>${escapeHtml(e instanceof Error ? e.message : String(e))}</p><p><a class="btn" href="/api/admin/gmail/connect">Try again</a></p>`, status: 400 });
    }
  }

  const { data } = await sb.from('gmail_credentials').select('connected_at').eq('mailbox', mailbox).maybeSingle();
  const state = randomBytes(24).toString('base64url');
  cookies.set(COOKIE, state, { path: '/api/admin/gmail', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
  const since = data?.connected_at ? new Date(data.connected_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null;
  const viaEnv = !!env.GMAIL_REFRESH_TOKEN;
  return calmPage({
    title, eyebrow: since || viaEnv ? 'Connected' : 'One time', heading: since || viaEnv ? 'Gmail is connected' : 'Connect Gmail',
    body: `<p>${since ? `Connected as <b>${escapeHtml(mailbox)}</b> since ${escapeHtml(since)}.` : viaEnv ? `Using the refresh token in Vercel for <b>${escapeHtml(mailbox)}</b>.` : `So every email from the site leaves from <b>${escapeHtml(mailbox)}</b>, and lead replies are read from your inbox. I ask once; Google keeps the permission until you remove it.`}</p>
<p>Permissions: read mail, create drafts, send mail. Nothing goes to a lead without your approval.</p>
<p class="row"><a class="btn" href="${escapeHtml(authUrl({ clientId: env.GMAIL_CLIENT_ID, redirectUri, state, loginHint: mailbox }))}">${since || viaEnv ? 'Reconnect Gmail' : 'Connect Gmail'}</a></p>
<p class="small">Sign in with ${escapeHtml(mailbox)}. The token is encrypted before it is stored.</p>`,
  });
};
