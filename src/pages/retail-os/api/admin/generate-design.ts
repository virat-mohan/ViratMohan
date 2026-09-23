export const prerender = false;

import type { APIRoute } from 'astro';
import { getRetailOsDb } from '../../../../lib/retail-os-db';
import { getEnv } from '../../../../lib/env';
import { generateDesignDirection, DESIGN_DIRECTION_PROMPT_VERSION } from '../../../../lib/retail-os-design-direction';

// Gated by src/middleware.ts ('/retail-os/api/admin' is a protected prefix).
export const POST: APIRoute = async ({ request }) => {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const id = (body.id || '').trim();
  if (!id) return json({ error: 'id is required' }, 400);

  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 503);

  const db = getRetailOsDb(env);
  const app = await db.getById(id);
  if (!app) return json({ error: 'Application not found' }, 404);

  try {
    const output = await generateDesignDirection(
      {
        brandName: app.brand_name,
        category: app.category,
        format: app.format,
        handle: app.handle,
        shopifyUrl: app.catalog_mode === 'shopify' ? app.shopify_url : null,
      },
      env.ANTHROPIC_API_KEY
    );

    // Model output is shaped by web-search content, and it's rendered as link
    // hrefs and inline style values on the partner's tracker — only allow
    // http(s) URLs and strict hex colours through.
    const cleanRef = (r: { name: string; url: string; note: string }) => ({
      name: String(r.name ?? ''),
      url: /^https?:\/\//i.test(String(r.url ?? '')) ? String(r.url) : '',
      note: String(r.note ?? ''),
    });
    const cleanHex = (h: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(h ?? '')) ? String(h) : '#CCCCCC');
    const p = output.colorPalette;

    const designId = await db.saveDesignDirection({
      application_id: id,
      model: 'claude-sonnet-5',
      prompt_version: DESIGN_DIRECTION_PROMPT_VERSION,
      has_existing_site: output.hasExistingSite,
      primary_reference: cleanRef(output.primaryReference),
      additional_references: (output.additionalReferences ?? []).map(cleanRef),
      color_palette: {
        primaryHex: cleanHex(p.primaryHex), secondaryHex: cleanHex(p.secondaryHex), accentHex: cleanHex(p.accentHex),
        backgroundHex: cleanHex(p.backgroundHex), textHex: cleanHex(p.textHex), rationale: String(p.rationale ?? ''),
      },
      typography: output.typography,
      ux_principles: output.uxPrinciples,
      tone_of_voice: output.toneOfVoice,
    });

    return json({ id: designId }, 201);
  } catch (err) {
    console.error('retail-os generate-design failed', err);
    return json({ error: err instanceof Error ? err.message : 'Design generation failed' }, 500);
  }
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
