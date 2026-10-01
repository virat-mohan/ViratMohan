// WhatsApp inbox (Retail OS core, Inbox → WhatsApp). Pure helpers: pull messages and
// delivery statuses out of a Cloud API webhook, group them into threads, and say whether
// a free-form reply is allowed (Meta allows it only within 24 hours of the customer's last
// message; after that only an approved template can be sent).
export type InboxMessage = {
  wa_message_id: string | null; direction: 'in' | 'out'; contact_phone: string; contact_name: string | null;
  body: string; media_id: string | null; at: string; status?: string | null; read_at?: string | null;
};
export type StatusUpdate = { wa_message_id: string; status: string };

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function inboxFromWebhook(body: any): { messages: InboxMessage[]; statuses: StatusUpdate[] } {
  const messages: InboxMessage[] = []; const statuses: StatusUpdate[] = [];
  for (const entry of body?.entry ?? []) for (const ch of entry?.changes ?? []) {
    const v = ch?.value ?? {};
    const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id), String(c.profile?.name ?? '')]));
    for (const m of v.messages ?? []) {
      const media = m.image ?? m.document ?? m.audio ?? m.video ?? m.sticker ?? null;
      const text = m.text?.body ?? m.image?.caption ?? m.document?.caption ?? m.video?.caption
        ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
        ?? (media ? `[${m.type}]` : m.type === 'location' ? '[location]' : `[${m.type ?? 'message'}]`);
      messages.push({
        wa_message_id: String(m.id), direction: 'in', contact_phone: String(m.from),
        contact_name: names.get(String(m.from)) || null, body: String(text), media_id: media?.id ?? null,
        at: new Date(Number(m.timestamp) * 1000).toISOString(),
      });
    }
    // Coexistence: messages the brand sends from the phone app arrive as echoes.
    for (const m of v.message_echoes ?? []) {
      messages.push({
        wa_message_id: String(m.id), direction: 'out', contact_phone: String(m.to), contact_name: null,
        body: String(m.text?.body ?? `[${m.type ?? 'message'}]`), media_id: null,
        at: new Date(Number(m.timestamp) * 1000).toISOString(), status: 'sent',
      });
    }
    for (const s of v.statuses ?? []) statuses.push({ wa_message_id: String(s.id), status: String(s.status) });
  }
  return { messages, statuses };
}

export type Thread = { phone: string; name: string | null; last: InboxMessage; unread: number; canReply: boolean };

export function canReplyFreeForm(msgs: InboxMessage[], now = new Date()): boolean {
  const lastIn = msgs.filter((m) => m.direction === 'in').map((m) => Date.parse(m.at)).sort((a, b) => b - a)[0];
  return !!lastIn && now.getTime() - lastIn < REPLY_WINDOW_MS;
}

export function threads(msgs: InboxMessage[], now = new Date()): Thread[] {
  const by = new Map<string, InboxMessage[]>();
  for (const m of msgs) (by.get(m.contact_phone) ?? by.set(m.contact_phone, []).get(m.contact_phone)!).push(m);
  return [...by.entries()].map(([phone, list]) => {
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return {
      phone, name: list.find((m) => m.contact_name)?.contact_name ?? null, last: list[list.length - 1],
      unread: list.filter((m) => m.direction === 'in' && !m.read_at).length, canReply: canReplyFreeForm(list, now),
    };
  }).sort((a, b) => Date.parse(b.last.at) - Date.parse(a.last.at));
}
