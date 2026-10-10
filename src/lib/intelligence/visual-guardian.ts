// Visual Design & Brand Guardian — agent definition and review contract.
// Reports to CMO (DS-11 Grow). Pure contract: no provider calls, no network, no framework.

// ── Agent passport ───────────────────────────────────────────────────────

export const VISUAL_GUARDIAN_ID = 'DS-16';

export const VISUAL_GUARDIAN_PASSPORT = {
  id: VISUAL_GUARDIAN_ID,
  name: 'Guard',
  role: 'specialist' as const,
  reportsTo: 'DS-11',
  purpose: 'World-class visual QA and preservation of brand and platform standards',
  inputs: [
    'brand-foundation', 'brand-book', 'approved-visual-system', 'asset-library',
    'creative-brief', 'campaign', 'product', 'platform-design-tokens',
    'viratmohan-design-system', 'channel-specifications', 'approved-references', 'learnings',
  ],
  outputs: [
    'design-review', 'qa-result', 'revision-requirements', 'brand-drift-finding',
    'platform-drift-finding', 'approval-or-block', 'visual-learning-candidate',
  ],
  kpis: [
    'critical-defect-escape-rate', 'brand-compliance', 'first-pass-approval',
    'revision-rate', 'product-fidelity-defects', 'channel-spec-compliance',
    'review-time', 'creative-performance-correlation',
  ],
  canDo: [
    'inspect', 'reject', 'require-revision', 'approve', 'identify-brand-drift',
    'identify-platform-drift', 'identify-product-fidelity-defect',
    'identify-technical-visual-defect', 'create-work-item',
  ],
  cannotDo: [
    'rewrite-brand-foundation', 'rewrite-brand-book', 'change-positioning',
    'change-pricing', 'change-marketing-budget', 'approve-legal-claims',
    'override-founder', 'publish-outside-release-authority',
  ],
};

// ── Review verdict ───────────────────────────────────────────────────────

export type ReviewVerdict = 'approved' | 'revision_required' | 'blocked';

export type DefectSeverity = 'critical' | 'major' | 'minor' | 'observation';

export interface DesignDefect {
  severity: DefectSeverity;
  category: string;
  description: string;
  /** Where the defect was found: file, URL, component, etc. */
  location: string;
}

export interface DesignReview {
  assetId: string | null;
  brand: string | null;
  verdict: ReviewVerdict;
  defects: DesignDefect[];
  platformCompliance: PlatformComplianceCheck;
  /** Only true if no critical or major defects and platform compliance passes. */
  releaseReady: boolean;
}

// ── Platform brand compliance ────────────────────────────────────────────

export interface PlatformComplianceCheck {
  signatureColourLine: boolean;
  platformTypography: boolean;
  breadcrumbs: boolean;
  mobileUsability: boolean;
  touchTargets44px: boolean;
  noHorizontalOverflow: boolean;
  navigationHierarchy: boolean;
  brandContentWithinPlatform: boolean;
}

export function checkPlatformCompliance(checks: PlatformComplianceCheck): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!checks.signatureColourLine) failures.push('Missing ViratMohan.com signature colour line (.vm-band)');
  if (!checks.platformTypography) failures.push('Non-standard typography (must use tokens.css fonts)');
  if (!checks.breadcrumbs) failures.push('Missing breadcrumbs');
  if (!checks.mobileUsability) failures.push('Mobile usability failure');
  if (!checks.touchTargets44px) failures.push('Touch targets below 44px');
  if (!checks.noHorizontalOverflow) failures.push('Horizontal overflow detected');
  if (!checks.navigationHierarchy) failures.push('Unclear navigation hierarchy');
  if (!checks.brandContentWithinPlatform) failures.push('Brand content breaks platform system');
  return { pass: failures.length === 0, failures };
}

// ── Release gate ─────────────────────────────────────────────────────────

export type ReleaseGateStage = 'draft' | 'design_review' | 'revision_required' | 'approved';

export function resolveReleaseGate(review: DesignReview): ReleaseGateStage {
  if (review.defects.some((d) => d.severity === 'critical' || d.severity === 'major')) return 'revision_required';
  if (!review.platformCompliance.signatureColourLine) return 'revision_required';
  if (!review.releaseReady) return 'revision_required';
  return 'approved';
}

// ── World-class quality benchmark ────────────────────────────────────────

/** Quality dimensions the Visual Guardian assesses. */
export const QUALITY_DIMENSIONS = [
  'concept', 'art-direction', 'hierarchy', 'composition', 'spacing',
  'typography', 'colour', 'logo-usage', 'imagery', 'product-fidelity',
  'technical-polish', 'channel-fitness', 'responsive-behaviour',
  'accessibility', 'platform-brand-consistency',
] as const;

/** Automatic rejection criteria — obvious defects that block release. */
export const AUTO_REJECT_CRITERIA = [
  'generic-ai-aesthetics', 'fake-text', 'distorted-logos', 'malformed-products',
  'broken-anatomy', 'impossible-reflections', 'visual-artifacts',
  'template-looking-work', 'poor-hierarchy', 'inconsistent-branding',
  'poor-exports', 'incorrect-dimensions',
] as const;

// ── Platform brand rules ─────────────────────────────────────────────────

/**
 * The ViratMohan.com signature colour line.
 * Four equal swatches: gold (#d4af37), magenta (#e91e8c), cobalt (#3e6fa6), terracotta (#d9714b).
 * Implemented as `.vm-band` in /brand/tokens.css.
 * This is a canonical platform element present on every operating surface.
 */
export const SIGNATURE_COLOUR_LINE = {
  cssClass: 'vm-band',
  heroClass: 'vm-band--hero',
  source: '/brand/tokens.css',
  colours: ['#d4af37', '#e91e8c', '#3e6fa6', '#d9714b'] as const,
  colourNames: ['gold', 'magenta', 'cobalt', 'terracotta'] as const,
  height: '5px',
  heroHeight: '10px',
} as const;

/**
 * Platform hierarchy for operating surfaces.
 * Every dashboard is a ViratMohan.com surface first.
 */
export const PLATFORM_HIERARCHY = ['viratmohan.com', 'devshop', 'retail-os', 'brand'] as const;

/**
 * Surfaces that must carry the platform signature line.
 */
export const PLATFORM_SURFACES = [
  'founder-dashboard', 'founder-command-centre', 'founder-control-tower',
  'brand-command-centres', 'retail-os-brand-dashboards',
  'devshop-internal-surfaces',
] as const;
