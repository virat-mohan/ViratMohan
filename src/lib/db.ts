import { createClient } from '@supabase/supabase-js';
import type { PnlLeverHit } from './pnl-levers';

export type Submission = {
  id: string;
  problem: string;
  company: string | null;
  website: string | null;
  tools: string | null;
  email: string;
  status: 'received' | 'demo_ready' | 'sent' | 'failed';
  pnl_levers: PnlLeverHit[] | null;
  artefact_html: string | null;
  error: string | null;
  created_at: string;
};

// Service-role client: full read/write, bypasses RLS. Only ever constructed
// server-side (inside API routes / server-rendered admin pages) — the key
// must never reach the browser.
export function getDb(env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  return {
    async insertSubmission(row: {
      id: string;
      problem: string;
      company: string | null;
      website: string | null;
      tools: string | null;
      email: string;
    }) {
      const { error } = await supabase.from('submissions').insert({ ...row, status: 'received' });
      if (error) throw new Error(`supabase insert failed: ${error.message}`);
    },

    async markDemoReady(id: string, levers: PnlLeverHit[], artefactHtml: string) {
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'demo_ready',
          pnl_levers: levers,
          artefact_html: artefactHtml,
          classified_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw new Error(`supabase update (demo_ready) failed: ${error.message}`);
    },

    async markFailed(id: string, message: string) {
      const { error } = await supabase.from('submissions').update({ status: 'failed', error: message }).eq('id', id);
      if (error) console.error('supabase update (failed) also failed:', error.message);
    },

    async markSent(id: string) {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'sent', approved_at: now, sent_at: now })
        .eq('id', id);
      if (error) throw new Error(`supabase update (sent) failed: ${error.message}`);
    },

    async getById(id: string): Promise<Submission | null> {
      const { data, error } = await supabase.from('submissions').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`supabase select failed: ${error.message}`);
      return data as Submission | null;
    },

    async listRecent(limit = 100): Promise<Submission[]> {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`supabase list failed: ${error.message}`);
      return (data ?? []) as Submission[];
    },
  };
}
