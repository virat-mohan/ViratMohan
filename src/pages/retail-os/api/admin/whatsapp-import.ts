export const prerender = false;

import type { APIRoute } from 'astro';
import { getEnv } from '../../../../lib/env';
import { serviceDb } from '../../../../lib/ledger';
import { importWhatsAppExport } from '../../../../lib/ingest/whatsapp-import';
import { json } from '../../../../lib/retail-os-http';

// Gated by src/middleware.ts (admin Basic Auth).
// Upload a WhatsApp "Export chat" .txt for one product group:
//   curl -u admin:$ADMIN_PASSWORD -F file=@chat.txt -F group="Moonglasses expenses" \
//        [-F dry_run=1] https://viratmohan.com/retail-os/api/admin/whatsapp-import
// dry_run returns the parsed rows without writing. Re-uploading is a no-op.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const group = String(form?.get('group') || (file instanceof File ? file.name.replace(/^WhatsApp Chat (with|-)\s*/i, '').replace(/\.txt$/i, '') : '')).trim();
  if (!(file instanceof File)) return json({ error: 'Attach the export as "file".' }, 400);
  if (!group) return json({ error: 'Say which group this is ("group").' }, 400);
  if (file.size > 5_000_000) return json({ error: 'File is larger than 5 MB.' }, 413);
  const order = String(form?.get('date_order') || '');
  const env = getEnv();
  try {
    const summary = await importWhatsAppExport(serviceDb(env), {
      text: await file.text(), groupName: group, anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
      dryRun: !!form?.get('dry_run'), dateOrder: order === 'mdy' || order === 'dmy' ? order : undefined,
    });
    return json(summary, 200);
  } catch (err) {
    console.error('whatsapp import failed', err);
    return json({ error: 'Import failed.' }, 500);
  }
};
