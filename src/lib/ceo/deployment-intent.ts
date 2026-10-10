// Is this request really technical deployment work? Decided from the requested action, the target system and
// the production context together, never from one generic word. Pure and deterministic; no AI invocations.
// Scope follows CLAUDE.md (Team): accounts, integrations, keys, webhooks, templates, DNS, deploys, setup records.

export interface DeploymentIntent {
  action: string;
  target: string | null;
  production: boolean;
}

const SETUP_VERB = /\b(set\s*up|setup|configure|connect|integrate|install|provision|migrate|rotate|renew)\b/i;
const DEPLOY_VERB = /\b(redeploy|deploy|release|roll\s*out|go\s+live|push\s+to\s+(?:prod|production|live))\b/i;
const TARGET = /\b(dns|domain|ssl|tls|certificate|webhooks?|api\s*keys?|smtp|spf|dkim|dmarc|vercel|supabase|payment\s+gateway|gateway|razorpay|shiprocket|shopify|hosting|server|cdn|database|environment|env\s+vars?)\b/i;
const PRODUCTION = /\b(production|prod|staging)\b/i;
// Asking about the thing is not asking for the thing: a request led by an analysis verb is not deployment work.
const ANALYSIS_VERB = /\b(review|analy[sz]e|analysis|compare|evaluate|assess|audit|summari[sz]e|forecast|explain|why)\b/i;
const ANALYSIS_OBJECT = /\b(costs?|pricing|report|campaign|performance|metrics?|budget|rates?)\b/i;

const at = (re: RegExp, s: string) => { const m = re.exec(s); return m ? { i: m.index, w: m[0].toLowerCase().replace(/\s+/g, ' ') } : null; };

export function deploymentIntent(text: string): DeploymentIntent | null {
  const setup = at(SETUP_VERB, text);
  const deploy = at(DEPLOY_VERB, text);
  const analysis = at(ANALYSIS_VERB, text);
  const verbs = [setup, deploy].filter((v): v is { i: number; w: string } => !!v);
  if (!verbs.length) return null;
  const lead = verbs.reduce((a, b) => (a.i <= b.i ? a : b));
  if (analysis && analysis.i < lead.i) return null;
  const target = at(TARGET, text);
  const production = PRODUCTION.test(text);
  if (!production && !deploy && ANALYSIS_OBJECT.test(text)) return null;
  const qualifies = (deploy && (target || production)) || (setup && target);
  return qualifies ? { action: lead.w, target: target?.w ?? null, production } : null;
}

/** A question about a deployment target (for example "What DNS records does Moon need?"), not about its cost or performance. */
export function isDeploymentQuestion(text: string): boolean {
  return TARGET.test(text) && !ANALYSIS_OBJECT.test(text);
}

export const describeIntent = (i: DeploymentIntent): string =>
  `action=${i.action}; target=${i.target ?? 'none'}; production=${i.production}`;
