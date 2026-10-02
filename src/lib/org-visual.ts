// Visualiser tab of the org board: pure layout, edge and replay helpers (no I/O).
import type { OrgMember, OrgUpdate, OrgStatus } from './org-board';

export type Group = 'top' | 'centre' | 'brand' | 'function' | 'side';
export type VizNode = { id: string; short: string; group: Group; x: number; y: number };
export type Edge = { from: string; to: string; kind: 'reports' | 'help'; text?: string };

export const groupOf = (m: Pick<OrgMember, 'id' | 'kind'>): Group =>
  m.kind === 'founder' || m.kind === 'cofounder' ? 'top'
  : m.id === 'DS-02' || m.kind === 'ceo' ? 'centre'
  : m.kind === 'brand_ceo' ? 'brand'
  : m.kind === 'function' ? 'function' : 'side';

export const shortName = (name: string) => name.split(/\s+/)[0].slice(0, 9);

const ring = (ids: string[], cx: number, cy: number, r: number, start: number, end: number) =>
  ids.map((id, i) => { const a = ids.length === 1 ? (start + end) / 2 : start + ((end - start) * i) / (ids.length - 1); return { id, x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) }; });

/** Desktop network, viewBox 1200 x 760. Founder and co-founder top, Dev centre, brands inner ring, functions outer ring, Prince and board at the side. */
export function layoutWide(members: OrgMember[]): VizNode[] {
  const by = (g: Group) => members.filter((m) => groupOf(m) === g).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const out: VizNode[] = [];
  const push = (m: OrgMember, x: number, y: number) => out.push({ id: m.id, short: shortName(m.name), group: groupOf(m), x, y });
  const top = by('top'); top.forEach((m, i) => push(m, 520 + (i - (top.length - 1) / 2) * 180, 70));
  const cx = 520, cy = 440;
  by('centre').forEach((m, i) => push(m, cx + i * 110, cy));
  const brands = by('brand'); ring(brands.map((m) => m.id), cx, cy, 150, Math.PI * 0.15, Math.PI * 0.85 + (brands.length > 4 ? Math.PI * 0.5 : 0)).forEach((p, i) => push(brands[i], p.x, p.y));
  const fns = by('function'); ring(fns.map((m) => m.id), cx, cy, 280, Math.PI * 1.05, Math.PI * 1.95).forEach((p, i) => push(fns[i], p.x, Math.max(p.y, 200)));
  const side = by('side'); side.forEach((m, i) => push(m, 1080, 120 + i * 120));
  return out;
}

/** Phone layout, viewBox 360 wide: rows of up to 3, one band per group, top to bottom. */
export function layoutNarrow(members: OrgMember[]): { nodes: VizNode[]; height: number; bands: { label: string; y: number }[] } {
  const order: [Group, string][] = [['top', 'Founders'], ['centre', 'CEO'], ['brand', 'Brand CEOs'], ['function', 'Function heads'], ['side', 'Team and board']];
  const nodes: VizNode[] = []; const bands: { label: string; y: number }[] = [];
  let y = 30;
  for (const [g, label] of order) {
    const ms = members.filter((m) => groupOf(m) === g).sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
    if (!ms.length) continue;
    bands.push({ label, y }); y += 50;
    ms.forEach((m, i) => { const row = Math.floor(i / 3), col = i % 3, inRow = Math.min(3, ms.length - row * 3); nodes.push({ id: m.id, short: shortName(m.name), group: g, x: Math.round(180 + (col - (inRow - 1) / 2) * 112), y: y + row * 112 }); });
    y += Math.ceil(ms.length / 3) * 112 + 10;
  }
  return { nodes, height: y, bands };
}

/** Who must act on a help or stuck item, from ORG-SOP decision rights. */
export function escalationTarget(text: string, member: Pick<OrgMember, 'id' | 'reports_to'>): string {
  const t = text.toLowerCase();
  let to = /prince|money|spend|budget|ad cap|top.?up|price|offer|discount|₹|rupee|invoice|payment|terms|legal|nda|equity|hir|irreversible|send|approve|handle|post on/.test(t) ? 'DS-00'
    : /principle|mission|value|voice|brand book|veto|fair/.test(t) ? 'DS-01' : 'DS-02';
  if (to === member.id) to = member.reports_to ?? 'DS-00';
  return to;
}

export function buildEdges(members: OrgMember[], latest: Map<string, OrgUpdate | null>): Edge[] {
  const ids = new Set(members.map((m) => m.id));
  const edges: Edge[] = members.filter((m) => m.reports_to && ids.has(m.reports_to)).map((m) => ({ from: m.id, to: m.reports_to!, kind: 'reports' as const }));
  for (const m of members) {
    const u = latest.get(m.id);
    for (const text of [u?.help_needed, u?.stuck_on]) {
      if (!text || !text.trim()) continue;
      const to = escalationTarget(text, m);
      if (ids.has(to) && !edges.some((e) => e.kind === 'help' && e.from === m.id && e.to === to)) edges.push({ from: m.id, to, kind: 'help', text });
    }
  }
  return edges;
}

/** Status of each member at the end of each of the last 7 IST days (oldest first). */
export function replayDays(today: string, updates: OrgUpdate[]): { day: string; status: Record<string, OrgStatus | null> }[] {
  const days: string[] = [];
  const base = Date.parse(`${today}T00:00:00+05:30`);
  for (let i = 6; i >= 0; i--) days.push(new Date(base - i * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10));
  const sorted = [...updates].sort((a, b) => a.at.localeCompare(b.at));
  return days.map((day) => {
    const end = Date.parse(`${day}T23:59:59.999+05:30`);
    const status: Record<string, OrgStatus | null> = {};
    for (const u of sorted) if (Date.parse(u.at) <= end) status[u.member_id] = u.status;
    return { day, status };
  });
}

export const isRecent = (iso: string | undefined, now: number, ms = 2 * 36e5) => !!iso && now - Date.parse(iso) >= 0 && now - Date.parse(iso) < ms;
