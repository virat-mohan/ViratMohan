// Minimal Claude client (the repo has no Anthropic SDK; this uses fetch).
// The stable knowledge prefix goes first in `system` with cache_control so repeat calls hit the prompt cache.

export const MODEL_ROUTINE = 'claude-sonnet-5';
export const MODEL_HIGH_STAKES = 'claude-opus-5-5';

export type ClaudeRequest = {
  stakes: 'routine' | 'high';
  stablePrefix: string;                // cached: mission, values, playbook, voice
  system?: string;                     // per-call instructions (not cached)
  user: string;
  maxTokens?: number;
};
export type ClaudeResponse = { text: string; model: string };

/** Anything that can answer a ClaudeRequest. Tests pass a mock. */
export interface ClaudeClient { complete(req: ClaudeRequest): Promise<ClaudeResponse> }

export function modelFor(stakes: ClaudeRequest['stakes']) { return stakes === 'high' ? MODEL_HIGH_STAKES : MODEL_ROUTINE; }

export function buildBody(req: ClaudeRequest) {
  const system: Record<string, unknown>[] = [{ type: 'text', text: req.stablePrefix, cache_control: { type: 'ephemeral' } }];
  if (req.system) system.push({ type: 'text', text: req.system });
  return { model: modelFor(req.stakes), max_tokens: req.maxTokens ?? 600, system, messages: [{ role: 'user', content: req.user }] };
}

export function fetchClaude(apiKey: string, fetchImpl: typeof fetch = fetch): ClaudeClient {
  return {
    async complete(req) {
      const body = buildBody(req);
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return { text: (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(), model: body.model };
    },
  };
}

/** Pull the first JSON object out of a model reply. */
export function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}
