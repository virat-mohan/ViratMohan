// Phase 6: Shared learning operational.
// Parses LEARNINGS.md into structured records, integrates Work Registry learning
// fields, and provides a lookup for agents to check before acting.
// Pure data — no network, no database, no framework imports.

import type { Learning } from '../work/types';

export interface LearningRecord {
  date: string;
  trigger: string;
  rule: string;
  modules: string[];
  source: 'learnings_md' | 'work_registry';
  workItemId: string | null;
}

const MODULE_KEYWORDS: Record<string, string[]> = {
  checkout: ['checkout', 'payment', 'UPI', 'COD', 'cart', 'Razorpay'],
  email: ['email', 'Gmail', 'draft', 'send_message', 'Resend', 'branded template', 'renderRetailOsEmail'],
  whatsapp: ['WhatsApp', 'MSG91', 'message_echoes', 'coexistence'],
  brand: ['brand book', 'brand voice', 'checkVoice', 'drift', 'copy'],
  social: ['reel', 'Instagram', 'Buffer', 'collab', 'story', 'social'],
  leads: ['lead', 'NDA', 'proposal', 'deposit', 'submitForApproval'],
  shipping: ['shipping', 'courier', 'Shiprocket', 'delivery', 'tracking'],
  health: ['health check', 'health-check', 'audit'],
  data: ['number', 'stat', 'forecast', 'metric', 'source'],
  git: ['branch', 'commit', 'merge', 'reset', 'git'],
  ui: ['mobile', 'phone', 'responsive', 'grid', 'layout', 'tap target'],
  security: ['auth', 'honeypot', 'rate limit', 'spam', 'credential'],
  sync: ['sync', 'import', 'CSV', 'Shopify', 'connector'],
};

function detectModules(text: string): string[] {
  const found: string[] = [];
  for (const [mod, keywords] of Object.entries(MODULE_KEYWORDS)) {
    if (keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
      found.push(mod);
    }
  }
  return found;
}

export function parseLearningsMd(content: string): LearningRecord[] {
  const records: LearningRecord[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^-\s+(\d{4}-\d{2}-\d{2}(?:\s*·[^:]*)?)\s*:\s*(.+)$/);
    if (!match) continue;

    const rawDate = match[1].trim();
    const date = rawDate.match(/^\d{4}-\d{2}-\d{2}/)![0];
    const body = match[2].trim();

    const sentences = body.split(/\.\s+/);
    const trigger = sentences[0] || body;
    const ruleWords = ['Rule:', 'Never', 'Always', 'Every', 'Do not', 'Don\'t', 'Check', 'Before'];
    const ruleSentence = sentences.find(s => ruleWords.some(w => s.startsWith(w))) || sentences[sentences.length - 1] || '';

    records.push({
      date,
      trigger: trigger.endsWith('.') ? trigger : trigger + '.',
      rule: ruleSentence.endsWith('.') ? ruleSentence : ruleSentence + '.',
      modules: detectModules(body),
      source: 'learnings_md',
      workItemId: null,
    });
  }

  return records;
}

export function workLearningToRecord(
  workItemId: string,
  learning: Learning,
  closedAt: string,
): LearningRecord {
  return {
    date: closedAt.slice(0, 10),
    trigger: learning.lesson,
    rule: learning.lesson,
    modules: detectModules(learning.lesson),
    source: 'work_registry',
    workItemId,
  };
}

export function checkLearnings(
  records: LearningRecord[],
  scope: { brand?: string | null; modules?: string[]; action?: string },
): LearningRecord[] {
  const { modules = [], action = '' } = scope;
  const actionLower = action.toLowerCase();

  return records.filter(r => {
    if (modules.length > 0 && r.modules.some(m => modules.includes(m))) return true;
    if (actionLower && r.trigger.toLowerCase().includes(actionLower)) return true;
    if (actionLower && r.rule.toLowerCase().includes(actionLower)) return true;
    return false;
  });
}

export function deduplicateLearnings(records: LearningRecord[]): LearningRecord[] {
  const seen = new Set<string>();
  return records.filter(r => {
    const key = r.rule.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function learningsSummary(records: LearningRecord[]): {
  total: number;
  byModule: Record<string, number>;
  bySource: Record<string, number>;
} {
  const byModule: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of records) {
    for (const m of r.modules) byModule[m] = (byModule[m] ?? 0) + 1;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }
  return { total: records.length, byModule, bySource };
}
