// No email leaves with a broken link. Every http(s) link in the body is fetched before
// sending; a link that doesn't load (404, 5xx, network error) blocks the send with the list.
// Learned 1 Oct 2026: a Korbi email linked a page that was deployed minutes after it went out.
const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
const SKIP = /^(mailto:|tel:)|wa\.me\/|maps\.google|calendar\.google/i;

export function linksIn(...parts: (string | undefined)[]): string[] {
  const all = parts.filter(Boolean).join(' ').match(URL_RE) ?? [];
  return [...new Set(all.map((u) => u.replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, '')))].filter((u) => !SKIP.test(u));
}

export async function brokenLinks(urls: string[], fetchImpl: typeof fetch = fetch): Promise<{ url: string; status: number | string }[]> {
  const bad: { url: string; status: number | string }[] = [];
  await Promise.all(urls.map(async (url) => {
    try {
      let r = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (r.status === 405 || r.status === 403) r = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      if (r.status >= 400) bad.push({ url, status: r.status });
    } catch (e) { bad.push({ url, status: (e as Error).name || 'error' }); }
  }));
  return bad;
}

export class BrokenLinkError extends Error {
  constructor(public bad: { url: string; status: number | string }[]) { super(`Email not sent: ${bad.length} link(s) don't load: ${bad.map((b) => `${b.url} (${b.status})`).join(', ')}`); }
}
