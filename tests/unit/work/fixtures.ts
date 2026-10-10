// Synthetic, realistic stories on the Work Registry. They are examples and tests, NOT live tickets.
// Brand "sample" and its CEO SG-01 are made up; the org agent ids (DS-02 Dev, DS-10 Check, DS-11 Grow,
// DS-13 Books, DS-14 Care, DS-00 Virat, P-01 Prince) are the real ones from case-study/ORG-SOP.md.
import { NO_FACTORS, Scopes, type Actor } from '../../../src/lib/work';
import { BOOKS, CARE, CHECK, DEV, FOUNDER, GROW, HEALTH, KHIWANI, PRINCE, SG_CEO, VIRAT, code, must, type Reg } from './helpers';

const CLOSURE = (what: string, kind: 'note' | 'metric' = 'note') => ({ closure: { method: what, evidence: [{ kind, ref: `check:${what.replace(/\W+/g, '-')}`, summary: what }] } });

/** Drive an item from NEW to CLOSED by legal moves (used to finish helper items in the stories). */
export function closeOut(reg: Reg, id: string, o: { priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'; owner: Actor; verifier: Actor; summary?: string }): void {
  const it = reg.get(id)!;
  if (it.state === 'new') must(reg.transition(id, 'triaged', DEV, { payload: { triage: { priority: o.priority ?? 'P3' } } }));
  if (reg.get(id)!.state === 'triaged') must(reg.transition(id, 'assigned', DEV, { payload: { owner: o.owner } }));
  if (reg.get(id)!.state === 'assigned') must(reg.transition(id, 'in_progress', o.owner));
  must(reg.transition(id, 'resolved', o.owner, { payload: { resolution: { kind: 'completed', summary: o.summary ?? 'done' } } }));
  must(reg.transition(id, 'verification', o.verifier));
  must(reg.transition(id, 'closed', o.verifier, { payload: CLOSURE(o.summary ?? 'checked it') }));
}

/** A. A brand founder asks, through the Command Centre, for something to be done. */
export function fixtureA(reg: Reg) {
  const ing = must(reg.ingestSourceEvent({ channel: 'command_centre', external_ref: 'cc-501', reporter: FOUNDER, brand: 'sample', type_hint: 'request',
    title: 'Add a size chart to the product pages', summary: 'Customers keep asking which size to pick, please add a size chart to each product page' }));
  const id = ing.item.id;
  must(reg.transition(id, 'triaged', CARE, { payload: { triage: { priority: 'P3', factors: { ...NO_FACTORS, strategic: 'supports' } } } }));
  must(reg.transition(id, 'assigned', CARE, { payload: { owner: SG_CEO }, reason: 'brand CEO owns the outcome' }));
  must(reg.transition(id, 'in_progress', SG_CEO));
  const scope = reg.get(id)!.scope;
  const copy = must(reg.createItem({ level: 'subtask', parent_id: id, type: 'task', title: 'Write the size chart copy', scope }, SG_CEO));
  const template = must(reg.createItem({ level: 'subtask', parent_id: id, type: 'task', title: 'Add the chart to the product template', scope }, SG_CEO));
  closeOut(reg, copy.id, { owner: GROW, verifier: CHECK, summary: 'copy reviewed against the brand book' });
  closeOut(reg, template.id, { owner: DEV, verifier: CHECK, summary: 'chart shows on a live product page' });
  must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'completed', summary: 'Size chart live on all product pages' } } }));
  must(reg.transition(id, 'verification', CHECK));
  must(reg.transition(id, 'closed', CHECK, { payload: CLOSURE('opened three product pages on a phone and saw the chart') }));
  return { id, copy: copy.id, template: template.id };
}

/** B. A critical technical incident: alert, dedupe, exclusive repo lock, diagnosis, verification, learning, prevention. */
export function fixtureB(reg: Reg) {
  const a1 = must(reg.ingestSourceEvent({ channel: 'system_alert', external_ref: 'hc-0310', fingerprint: 'checkout-5xx:sample', reporter: HEALTH, brand: 'sample', type_hint: 'incident',
    title: 'Checkout returns HTTP 500', summary: 'Health check: checkout failed three runs in a row' }));
  const id = a1.item.id;
  const again = must(reg.ingestSourceEvent({ channel: 'agent_detection', external_ref: 'ag-4411', fingerprint: 'checkout-5xx:sample', reporter: CHECK, brand: 'sample', title: 'Checkout errors seen by Check', summary: 'same failure, seen again' }));
  must(reg.transition(id, 'triaged', CHECK, { payload: { triage: { priority: 'P0', factors: { ...NO_FACTORS, operationalDisruption: 'critical', revenueProfitRisk: 'high', customerHarm: 'high' } } } }));
  must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO }, reason: 'brand CEO owns a live-store outage' }));
  must(reg.addSupporting(id, CHECK, DEV));
  must(reg.addSupporting(id, DEV, SG_CEO));
  const scope = { repository: 'sample-store', branch: 'hotfix/checkout', worktree: 'wt-hotfix', paths: ['app/checkout'], deployment_target: 'production', pr: null, material: true };
  const pre = reg.preflight(scope, id);
  const lock = must(reg.acquireLock(id, scope, SG_CEO));
  // a second agent wants the same live repository for something else: refused while the lock is held
  const other = must(reg.createItem({ type: 'improvement', title: 'Tidy the footer links', scope: Scopes.brand('sample') }, GROW));
  must(reg.transition(other.id, 'triaged', GROW, { payload: { triage: { priority: 'P4' } } }));
  must(reg.transition(other.id, 'assigned', DEV, { payload: { owner: GROW } }));
  const conflict = reg.acquireLock(other.id, { ...scope, branch: 'chore/footer', worktree: null, paths: ['components/footer'], deployment_target: null }, GROW);
  must(reg.transition(id, 'in_progress', SG_CEO));
  const log = must(reg.addEvidence(id, { kind: 'log', ref: 'log:checkout/05-oct', summary: 'stack trace: address read before it was set' }, CHECK));
  const ping = must(reg.addEvidence(id, { kind: 'deploy', ref: 'deploy:previous', summary: 'previous deployment promoted' }, SG_CEO));
  must(reg.logAction(id, { summary: 'Rolled back to the previous deployment', evidence_ids: [log.id] }, SG_CEO));
  must(reg.updateFields(id, { customer_impact: 'Customers could not pay until the rollback', security_risk: { level: 'none', note: 'no data exposure seen' } }, SG_CEO));
  must(reg.updateIncident(id, { diagnosis: 'A new optional field was read before it was set', result: 'Checkout completes again after rollback',
    addTests: [{ description: 'Place a test order through checkout', result: 'pass', evidence_id: ping.id }] }, SG_CEO));
  must(reg.transition(id, 'resolved', SG_CEO, { payload: { resolution: { kind: 'fixed', summary: 'Rolled back; permanent fix queued' } } }));
  const followUp = must(reg.createItem({ type: 'improvement', title: 'Smoke-test checkout before every deploy', scope: Scopes.retailOs('storefront') }, SG_CEO));
  must(reg.transition(id, 'verification', CHECK));
  must(reg.updateIncident(id, { cost: { value: null, unit: 'INR', basis: 'unknown', source: null, note: 'order gap not yet measured' }, revenue_impact: { value: null, unit: 'INR', basis: 'unknown', source: null, note: 'order gap not yet measured' },
    decision: 'Keep the rollback until the smoke test exists', addPrevention: [{ action: 'Smoke-test checkout before every deploy', work_id: followUp.id }] }, SG_CEO));
  must(reg.setLearning(id, { lesson: 'A field read before it is set only fails on the one path that skips the setter', reference: 'case-study/LEARNINGS.md', rule_added: true }, SG_CEO));
  must(reg.transition(id, 'closed', CHECK, { payload: CLOSURE('three clean health runs and a test order', 'metric') }));
  return { id, other: other.id, followUp: followUp.id, lock: lock.id, deduped: again.outcome, preflightClear: pre.clear, conflict: code(conflict) };
}

/** C. A finance clarification: lateral escalation to the specialist, human escalation to the accountants, Virat approves what is sent. */
export function fixtureC(reg: Reg) {
  const ing = must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'wa-9001', thread_ref: 'wa-th-3', reporter: FOUNDER, brand: 'sample',
    title: 'Is the GST on last week\'s statement right?', summary: 'The founder thinks GST may be counted twice on one line of the weekly statement' }));
  const id = ing.item.id;
  must(reg.transition(id, 'triaged', CARE, { payload: { triage: { priority: 'P2', factors: { ...NO_FACTORS, revenueProfitRisk: 'low' } } } }));
  must(reg.transition(id, 'assigned', CARE, { payload: { owner: CARE } }));
  must(reg.transition(id, 'in_progress', CARE));
  // lateral: straight to Books, no climbing
  must(reg.escalateLateral(id, BOOKS, CARE, 'a finance question belongs to Books'));
  const stmt = must(reg.addEvidence(id, { kind: 'link', ref: 'statement:2026-wk40', summary: 'the weekly statement line in question' }, BOOKS));
  // human: accountants hold the tax judgement
  must(reg.escalateToHuman(id, {
    to: 'khiwani', coverage_gap: 'coverage', what_happened: 'One statement line may carry GST twice', evidence_ids: [stmt.id],
    impact: 'The founder could be over- or under-paid by an amount not yet known', risk: 'Wrong tax treatment if the statement is re-issued unchecked',
    tried: ['Re-ran the statement', 'Compared the line with the invoice'], decision_required: 'Is GST treated correctly on this line?', recommended_action: 'Confirm the treatment, then re-issue the statement if needed',
  }, BOOKS));
  const waitingOn = reg.get(id)!.waiting?.on;
  const reply = must(reg.addEvidence(id, { kind: 'message', ref: 'email:khiwani-reply', summary: 'Accountants confirm the treatment is correct' }, BOOKS));
  must(reg.logAction(id, { summary: 'Khiwani & Co. confirmed the GST treatment', evidence_ids: [reply.id] }, BOOKS));
  must(reg.transition(id, 'in_progress', BOOKS));
  // anything sent to a founder is approved and sent by Virat
  must(reg.requestApproval(id, { requested_from: 'virat', authority: 'outbound_comms', reason: 'Reply to the founder on the GST question', evidence_ids: [reply.id], recommendation: 'Send the short explanation' }, BOOKS));
  const decided = must(reg.decideApproval(id, 'approved', VIRAT, 'send as drafted'));
  must(reg.transition(id, 'resolved', BOOKS, { payload: { resolution: { kind: 'completed', summary: 'GST treatment confirmed; founder replied to by Virat' } } }));
  must(reg.transition(id, 'verification', CARE));
  must(reg.transition(id, 'closed', CARE, { payload: CLOSURE('founder acknowledged the reply on WhatsApp') }));
  return { id, waitingOn, approvedBy: decided.item.approval?.decision?.by.id };
}

/** D. An agent notices an improvement. Objective → initiative → work item → subtask. */
export function fixtureD(reg: Reg) {
  const objective = must(reg.createItem({ level: 'objective', type: 'task', title: 'Keep live brands selling', description: 'Brands that are live get results every Monday', scope: Scopes.devshop() }, VIRAT));
  const initiative = must(reg.createItem({ level: 'initiative', parent_id: objective.id, type: 'task', title: 'Faster storefront', scope: Scopes.retailOs('storefront') }, DEV));
  const item = must(reg.createItem({ parent_id: initiative.id, type: 'improvement', title: 'Product page images load slowly on 4G', description: 'Largest image is heavier than it needs to be',
    scope: Scopes.retailOs('storefront', 'sample'), source: { channel: 'agent_detection', requester: CHECK } }, CHECK));
  must(reg.transition(item.id, 'triaged', CHECK, { payload: { triage: { priority: 'P4', factors: NO_FACTORS } } }));
  must(reg.addObserver(item.id, VIRAT, CHECK));
  const sub = must(reg.createItem({ level: 'subtask', parent_id: item.id, type: 'task', title: 'Measure image weight on the five busiest pages', scope: reg.get(item.id)!.scope }, CHECK));
  must(reg.logAction(item.id, { summary: 'Opened the page on a throttled connection and noted the image weight' }, CHECK));
  return { objective: objective.id, initiative: initiative.id, item: item.id, sub: sub.id };
}

/** E. The same request arrives from two channels, then a third message on one thread. One issue, one canonical item. */
export function fixtureE(reg: Reg) {
  const first = must(reg.ingestSourceEvent({ channel: 'command_centre', external_ref: 'cc-777', reporter: FOUNDER, brand: 'sample',
    title: 'Add a size chart to the product pages', summary: 'Customers keep asking which size to pick, please add a size chart to each product page' }));
  const second = must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'wa-778', thread_ref: 'wa-th-7', reporter: FOUNDER, brand: 'sample',
    title: 'Size chart on the product pages', summary: 'Customers keep asking which size to pick, please add a size chart to each product page' }));
  const merged = must(reg.mergeInto(second.item.id, first.item.id, CARE, 'same request, sent twice through two channels'));
  const third = must(reg.ingestSourceEvent({ channel: 'whatsapp', external_ref: 'wa-779', thread_ref: 'wa-th-7', reporter: FOUNDER, brand: 'sample', title: 'Any news on the size chart?', summary: 'checking in' }));
  return { canonical: first.item.id, duplicate: second.item.id, secondOutcome: second.outcome, thirdOutcome: third.outcome, thirdItem: third.item.id, merged };
}

/** F. Work that needs Virat: a price decision, and work for Prince, which only Virat can assign. */
export function fixtureF(reg: Reg) {
  const id = must(reg.createItem({ type: 'request', title: 'Offer a bundle price on two products', description: 'Founder wants a two-product bundle', scope: Scopes.brand('sample') }, SG_CEO)).id;
  must(reg.transition(id, 'triaged', SG_CEO, { payload: { triage: { priority: 'P2', factors: { ...NO_FACTORS, revenueProfitRisk: 'low' } } } }));
  must(reg.transition(id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
  must(reg.transition(id, 'in_progress', SG_CEO));
  const margin = must(reg.addEvidence(id, { kind: 'metric', ref: 'sheet:bundle-margin', summary: 'contribution margin of the bundle after shipping and fees' }, SG_CEO));
  must(reg.requestApproval(id, { requested_from: 'virat', authority: 'pricing', reason: 'Prices and offers are Virat\'s decision', evidence_ids: [margin.id], recommendation: 'Approve a 10% bundle discount' }, SG_CEO));
  const agentTry = code(reg.decideApproval(id, 'approved', DEV));
  const decided = must(reg.decideApproval(id, 'approved', VIRAT, 'approved for October'));
  const deploy = must(reg.createItem({ level: 'subtask', parent_id: id, type: 'task', title: 'Deploy the bundle configuration', scope: Scopes.brand('sample', 'storefront') }, SG_CEO));
  must(reg.transition(deploy.id, 'triaged', SG_CEO, { payload: { triage: { priority: 'P2' } } }));
  const devTry = code(reg.transition(deploy.id, 'assigned', DEV, { payload: { owner: PRINCE } }));
  must(reg.logAction(deploy.id, { summary: 'Recommended to Virat: Prince deploys the bundle configuration' }, DEV));
  const virat = must(reg.transition(deploy.id, 'assigned', VIRAT, { payload: { owner: PRINCE }, reason: 'Virat assigns Prince' }));
  return { id, deploy: deploy.id, agentTry, devTry, outcome: decided.item.approval?.decision?.outcome, owner: virat.owner?.id };
}

/** G. Work blocked by another work item; the blocker carries the dependency's priority. */
export function fixtureG(reg: Reg) {
  const x = must(reg.createItem({ type: 'request', title: 'Launch the UPI collect flow', scope: Scopes.brand('sample', 'checkout') }, SG_CEO));
  must(reg.transition(x.id, 'triaged', SG_CEO, { payload: { triage: { priority: 'P1', factors: { ...NO_FACTORS, promiseRisk: 'at_risk' } } } }));
  must(reg.transition(x.id, 'assigned', DEV, { payload: { owner: SG_CEO } }));
  must(reg.transition(x.id, 'in_progress', SG_CEO));
  const y = must(reg.createItem({ type: 'task', title: 'Get the payment message template approved', scope: Scopes.brand('sample', 'payments') }, SG_CEO));
  must(reg.addDependency(y.id, x.id, SG_CEO, 'the flow cannot go live without the approved template'));
  const cycle = code(reg.addDependency(x.id, y.id, SG_CEO));
  must(reg.transition(x.id, 'blocked', SG_CEO));
  const early = code(reg.transition(x.id, 'in_progress', SG_CEO));
  must(reg.transition(y.id, 'triaged', CREW_LIKE, { payload: { triage: { priority: 'P1', factors: { ...NO_FACTORS, blocksPriority: 'P1' } } } }));
  const blockedBy = reg.openBlockersOf(x.id);
  closeOut(reg, y.id, { priority: 'P1', owner: GROW, verifier: CHECK, summary: 'template approved' });
  const resumed = must(reg.transition(x.id, 'in_progress', SG_CEO));
  return { x: x.id, y: y.id, cycle, early, blockedBy, resumedState: resumed.state, blockedField: resumed.blocked };
}
const CREW_LIKE: Actor = { kind: 'agent', id: 'DS-15' };
void KHIWANI;
