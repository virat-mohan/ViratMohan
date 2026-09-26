export const prerender = false;
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { CHAT_SYSTEM, LEAD_TOOL, VIRAT_TOOL, chatDb, viratRequestEmail } from '../../../lib/retail-os-chat';
import { sendEmail } from '../../../lib/email';
import { serverBrain } from '../../../lib/brain';

type Msg = { role: 'user' | 'assistant'; content: string };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { sessionId?: string; page?: string; messages?: Msg[] } | null;
  const sessionId = String(body?.sessionId || '').slice(0, 64);
  const messages = (body?.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    // The API needs strictly alternating turns starting with the user: merge repeats, drop a leading assistant turn.
    .reduce<Msg[]>((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += '\n' + m.content; else acc.push({ ...m }); return acc; }, [])
    .filter((m, i) => !(i === 0 && m.role === 'assistant'));
  if (!sessionId || !messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'bad request' }, 400);
  if (messages.filter((m) => m.role === 'user').length > 25) return json({ reply: "Let's take this to WhatsApp so Virat can pick it up directly." });

  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'not configured' }, 500);
  const page = body?.page ? String(body.page).slice(0, 200) : null;
  const db = chatDb(env);

  // Ground the chat in the Brain (public audience: no customer data). If the Brain fails, use the static prompt alone.
  let system: unknown = CHAT_SYSTEM;
  try {
    const lastUser = messages[messages.length - 1].content;
    const ctx = await serverBrain(env).chatContext(lastUser, { audience: 'public' });
    if (ctx.block) system = [{ type: 'text', text: CHAT_SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: ctx.block }];
  } catch (e) { console.error('chat brain fallback', e); }

  // Up to two rounds so the model can save the lead and still reply.
  let convo: unknown[] = messages;
  let escalated = false;
  for (let round = 0; round < 3; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, system, tools: [LEAD_TOOL, VIRAT_TOOL], messages: convo }),
    });
    if (!res.ok) { console.error('chat claude', res.status, (await res.text()).slice(0, 300)); return json({ error: 'upstream' }, 502); }
    const data = await res.json();
    const uses = (data.content || []).filter((b: { type: string }) => b.type === 'tool_use');
    const text = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
    for (const u of uses) {
      if (u.name === 'request_virat') {
        const r = u.input || {};
        escalated = true;
        // Save the context first, then tell Virat. The person only gets a time after Virat taps approve.
        try { await db.upsert(sessionId, page, { founder_name: r.name, brand: r.brand, next_step: 'whatsapp', summary: `Wants Virat (${r.reason || 'asked'}): ${r.summary || ''}`.slice(0, 500), ...(String(r.contact || '').includes('@') ? { email: r.contact } : { phone: r.contact }) }, messages); } catch (e) { console.error('chat lead save', e); }
        if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && env.ADMIN_NOTIFY_EMAIL) {
          await sendEmail({ to: env.ADMIN_NOTIFY_EMAIL, ...viratRequestEmail(r, page, sessionId, process.env.CALL_BOOKING_URL) }, env)
            .catch((e) => console.error('call request email failed', e));
        } else console.error('call request: email not configured, request saved in retail_os_chat_leads only');
        continue;
      }
      try { await db.upsert(sessionId, page, u.input || {}, messages); } catch (e) { console.error('chat lead save', e); }
    }
    if (data.stop_reason !== 'tool_use') {
      try { await db.upsert(sessionId, page, {}, [...messages, { role: 'assistant', content: text }]); } catch {}
      return json({ reply: text, escalated });
    }
    convo = [...(convo as unknown[]), { role: 'assistant', content: data.content },
      { role: 'user', content: uses.map((u: { id: string }) => ({ type: 'tool_result', tool_use_id: u.id, content: 'saved' })) }];
  }
  return json({ reply: escalated ? "Thanks, I've sent this to Virat. Virat will look at this today and I'll send you a time." : "Thanks. The quickest next step is the 10-minute application at /retail-os/apply/.", escalated });
};
