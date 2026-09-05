import type { Submission } from './db';

// Generated automatically the moment a project is approved for build
// (deposit clears). This is the actual spec the tech team builds from —
// no separate SOW, per the product's "no proposal" rule extended past sale.
export function buildHandoffMarkdown(row: Submission): string {
  const notes = row.solution_notes;
  const levers = row.pnl_levers ?? [];
  const lines: string[] = [];

  lines.push(`# Build handoff — ${row.company || row.email}`);
  lines.push('');
  lines.push(`**Submission ID:** ${row.id}`);
  lines.push(`**Client email:** ${row.email}`);
  lines.push(`**Complexity tier:** ${row.complexity_tier ?? 'not set'}${row.price_recommendation ? ` — ${row.price_recommendation}` : ''}`);
  lines.push(`**Delivery deadline (30-day guarantee):** ${row.delivery_deadline ? new Date(row.delivery_deadline).toLocaleDateString() : 'not set'}`);
  lines.push(`**Tools/integrations named by client:** ${row.tools || 'none given — confirm at kickoff'}`);
  lines.push('');
  lines.push('## Original problem statement (verbatim)');
  lines.push('');
  lines.push(`> ${row.problem}`);
  lines.push('');

  if (row.feedback_text) {
    lines.push('## Client feedback (incorporated into this scope)');
    lines.push('');
    lines.push(`> ${row.feedback_text}`);
    lines.push('');
  }

  if (notes && notes.problemBreakdown.length > 0) {
    lines.push('## Diagnosis');
    lines.push('');
    notes.problemBreakdown.forEach((p, i) => {
      lines.push(`### ${i + 1}. ${p.problem_statement}`);
      lines.push(`- **Function:** ${p.business_function}`);
      lines.push(`- **Root cause:** ${p.root_cause}`);
      lines.push(`- **Who's affected:** ${p.who_is_affected}`);
      lines.push(`- **Cost of inaction:** ${p.current_cost_of_inaction}`);
      lines.push('');
    });
  }

  if (notes && notes.frameworkSelections.length > 0) {
    lines.push('## Framework applied');
    lines.push('');
    notes.frameworkSelections.forEach((f) => {
      lines.push(`- **${f.framework_name}** (${f.framework_source})${f.in_library ? '' : ' — _suggested beyond the curated library; review for addition_'}`);
      lines.push(`  Why: ${f.why_selected}`);
      if (f.runner_ups.length > 0) {
        lines.push(`  Also considered: ${f.runner_ups.map((r) => r.name).join(', ')}`);
      }
      lines.push('');
    });
  }

  if (levers.length > 0) {
    lines.push('## P&L impact target');
    lines.push('');
    levers.forEach((l) => {
      lines.push(`- **${l.category} — ${l.lever}:** ${l.reasoning}`);
    });
    lines.push('');
  }

  if (notes && notes.solutionMechanisms.length > 0) {
    lines.push('## Mechanism(s) to build');
    lines.push('');
    notes.solutionMechanisms.forEach((m) => {
      lines.push(`### ${m.mechanism_name}`);
      lines.push(`- **Trigger / data source:** ${m.trigger_or_data_source}`);
      lines.push('- **Steps:**');
      m.how_it_works_steps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
      lines.push(`- **Why this, not something generic:** ${m.why_not_generic}`);
      lines.push('');
    });
  }

  if (notes && notes.clarifyingQuestions.length > 0) {
    lines.push('## Open questions sent to client (confirm answers before/at kickoff)');
    lines.push('');
    notes.clarifyingQuestions.forEach((q) => lines.push(`- ${q}`));
    lines.push('');
  }

  lines.push('## Reference');
  lines.push('');
  lines.push(`- Approved demo artefact: ${row.id ? `/devshop/demo/${row.id}` : 'n/a'} (the interactive demo is the illustrative version — this handoff is the real build spec)`);
  lines.push(`- Admin record: /devshop/admin/${row.id}`);
  lines.push('');

  lines.push('## Build checklist (tech team owns from here)');
  lines.push('');
  lines.push('- [ ] Kickoff: confirm open questions above with client');
  lines.push('- [ ] Confirm real integration credentials/access for tools listed above');
  lines.push('- [ ] Build mechanism(s) per spec above');
  lines.push('- [ ] Internal UAT against the P&L impact target — does it actually move the number?');
  lines.push('- [ ] Client UAT / walkthrough');
  lines.push('- [ ] Deploy to client environment');
  lines.push('- [ ] Mark delivered in admin, request feedback + testimonial');
  lines.push('- [ ] Write FDE handover notes before context-switching off this account');
  lines.push('');
  lines.push('_Generated automatically when the deposit was recorded. This is the scope — no separate SOW._');

  return lines.join('\n');
}
