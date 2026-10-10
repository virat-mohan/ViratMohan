import { getDashboardSections } from '@/lib/dashboard';
import { COMMAND_CENTRE_CAPABILITIES, CAPABILITY_LABELS } from '@/lib/command-centre';

export default function CommandCentrePage() {
  const sections = getDashboardSections();
  const cc = sections.find((s) => s.section === 'command_centre');

  return (
    <div className="command-centre">
      <h1>Command Centre</h1>
      <section className="command-centre__capabilities">
        <h2>Capabilities</h2>
        <ul>
          {COMMAND_CENTRE_CAPABILITIES.map((cap) => (
            <li key={cap} className="command-centre__capability">
              <span className="command-centre__cap-label">{CAPABILITY_LABELS[cap]}</span>
              <span className="command-centre__cap-state">Coming soon</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="command-centre__sections">
        <h2>Dashboard Sections</h2>
        <ul>
          {sections.map((s) => (
            <li key={s.section}>
              {s.label} — {s.visible ? `${s.items.length} modules` : 'hidden'}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
