// Brand Foundation: the canonical identity, positioning, voice, and visual system for one brand.
// Lifecycle: DRAFT → REVIEW → APPROVED → COMMITTED → SUPERSEDED.
// Single source of truth: every brand-facing artifact (copy, design, product) traces back to it.
// Pure types and validators, no network or framework.

export type BrandFoundationStatus = 'draft' | 'review' | 'approved' | 'committed' | 'superseded';

export interface BrandIdentity {
  /** Brand name */
  name: string;
  /** One-line mission / what the brand stands for */
  mission: string;
  /** Tagline or positioning statement */
  positioning: string;
  /** Brand category / product type */
  category: string;
  /** Primary color hex (e.g., #d9714b) */
  primaryColor: string;
  /** Secondary accent color hex */
  accentColor: string;
}

export interface BrandICP {
  /** Ideal customer profile: who the brand is for */
  description: string;
  /** Customer persona name */
  persona: string;
  /** Income level or purchasing power */
  purchasingPower: string;
  /** Geographic focus */
  geography: string;
  /** Values the customer holds */
  values: string[];
}

export interface BrandVoice {
  /** Tone: e.g., "warm", "authoritative", "playful" */
  tone: string[];
  /** First/second/third person: always "I" for sole founder */
  person: 'first' | 'second' | 'third';
  /** Key phrases and never-say words */
  phrases: { always: string[]; never: string[] };
  /** Communication style: e.g., plain language, no jargon */
  style: string;
  /** CTA standard: e.g., "Let's talk" with link to WhatsApp */
  cta: string;
}

export interface BrandVisual {
  /** Typeface for headlines: e.g., "Anton" */
  displayFont: string;
  /** Typeface for body text: e.g., "Inter" */
  bodyFont: string;
  /** Spacing/scale system: e.g., "4px baseline" */
  spacing: string;
  /** Component library / design system name */
  system: string;
  /** Logo usage rules */
  logoRules: string;
}

export interface BrandClaim {
  /** What the brand claims: e.g., "free returns" */
  claim: string;
  /** How it is proven: evidence, source, test */
  proof: string;
  /** Who made the claim: Virat, founder, verified test */
  by: string;
  /** When it was verified */
  at: string;
}

export interface BrandRestriction {
  /** What the brand does NOT do */
  restriction: string;
  /** Why: business, legal, values-based */
  reason: string;
  /** Who decides this */
  by: string;
}

export interface BrandSource {
  /** Reference material: Brand Book MD, design system link, etc. */
  title: string;
  /** URL or file path */
  url: string;
  /** Last verified */
  at: string;
}

export interface BrandFoundation {
  id: string;
  brand: string; // brand key in central registry
  status: BrandFoundationStatus;
  version: number; // incremented on each version, SUPERSEDED versions kept for history

  identity: BrandIdentity;
  icp: BrandICP;
  voice: BrandVoice;
  visual: BrandVisual;

  claims: BrandClaim[];
  restrictions: BrandRestriction[];
  sources: BrandSource[];

  /** Gaps / unknowns that still need founder input */
  gaps: string[];
  /** Owner who approved / owns this version */
  owner: string;
  /** Approval timestamp */
  approvedAt: string | null;
  /** When it was committed to operational use */
  committedAt: string | null;
  /** When superseded by a newer version */
  supersededBy: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Validate a Brand Foundation object for basic shape and required fields.
 * Returns { valid: true } or { valid: false; errors: string[] }
 */
export function validateBrandFoundation(
  foundation: unknown,
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!foundation || typeof foundation !== 'object') {
    return { valid: false, errors: ['not an object'] };
  }

  const f = foundation as Record<string, unknown>;
  if (typeof f.brand !== 'string' || !f.brand) errors.push('brand key required');
  if (typeof f.status !== 'string' || !(['draft', 'review', 'approved', 'committed', 'superseded'] as string[]).includes(f.status)) errors.push('status must be one of: draft, review, approved, committed, superseded');

  // Identity
  if (!f.identity || typeof f.identity !== 'object') errors.push('identity required');
  else {
    const i = f.identity as Record<string, unknown>;
    if (typeof i.name !== 'string' || !i.name) errors.push('identity.name required');
    if (typeof i.mission !== 'string' || !i.mission) errors.push('identity.mission required');
    if (typeof i.primaryColor !== 'string' || !i.primaryColor.match(/^#[0-9a-fA-F]{6}$/)) errors.push('identity.primaryColor must be valid hex');
  }

  // Voice
  if (!f.voice || typeof f.voice !== 'object') errors.push('voice required');
  else {
    const v = f.voice as Record<string, unknown>;
    if (typeof v.tone !== 'object' || !Array.isArray(v.tone) || (v.tone as unknown[]).some((t) => typeof t !== 'string')) errors.push('voice.tone must be string array');
    if (typeof v.person !== 'string' || !(['first', 'second', 'third'] as string[]).includes(v.person)) errors.push('voice.person must be first, second, or third');
  }

  // Approve: only owner and approvedAt together
  if (f.status === 'approved' || f.status === 'committed') {
    if (typeof f.owner !== 'string' || !f.owner) errors.push('owner required for approved/committed status');
    if (typeof f.approvedAt !== 'string' || !f.approvedAt) errors.push('approvedAt required for approved/committed status');
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Can this foundation transition to a new status?
 * Valid transitions: DRAFT → REVIEW | REVIEW → APPROVED | APPROVED → COMMITTED | any → SUPERSEDED
 */
export function canTransition(from: BrandFoundationStatus, to: BrandFoundationStatus): boolean {
  if (from === to) return false;
  if (to === 'superseded') return true; // any status can be superseded
  if (from === 'draft' && to === 'review') return true;
  if (from === 'review' && to === 'approved') return true;
  if (from === 'approved' && to === 'committed') return true;
  return false;
}

/**
 * Merge gaps from review feedback. Called when moving to approved/committed status.
 * Returns updated gaps: removed if addressed, kept if still open.
 */
export function resolveGaps(currentGaps: string[], resolved: string[]): string[] {
  const resolvedSet = new Set(resolved);
  return currentGaps.filter((g) => !resolvedSet.has(g));
}
