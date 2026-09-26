// Employee Support Agent, question side. A team member asks on their tracker;
// the Brain answers from sourced staff knowledge and the answer is emailed to
// them. If the Brain has no evidence, they're told it's with Virat and Virat
// gets a nudge with a reply-to set to them. Both outcomes are logged on the
// tracker so the 9:30 team report shows them.
import type { Answer } from './brain/brain';
import type { SendEmailInput } from './email';
import { renderRetailOsEmail } from './retail-os-email';
import type { TeamMember } from './retail-os-ops';

export type SupportDeps = {
  answer: (q: string) => Promise<Answer>;
  send: (m: SendEmailInput) => Promise<unknown>;
  log: (kind: string, body: string) => Promise<void>;
  viratEmail: string;
  trackerUrl: string;
  consoleUrl: string;
};

export async function handleTeamQuestion(member: TeamMember, question: string, d: SupportDeps): Promise<{ answered: boolean; answer?: string }> {
  let a: Answer | null = null;
  try { a = await d.answer(question); } catch (err) { console.error('team support: brain failed', err); }
  const first = member.name.split(' ')[0];

  if (a?.known) {
    const sources = a.citations.map((c) => c.source).filter(Boolean).join(', ');
    await d.send({
      to: member.email,
      subject: `Re: ${question.slice(0, 70)}`,
      html: renderRetailOsEmail({
        preheader: a.answer.slice(0, 90),
        eyebrow: 'Your question',
        heading: 'Here is the answer',
        lines: [`Hi ${first},`, `You asked: "${question}"`, a.answer, 'If this does not fully answer it, reply to this email and it comes straight to me.'],
        note: sources ? `Answered by my assistant from: ${sources}.` : 'Answered by my assistant.',
        cta: { label: 'Back to your tracker', url: d.trackerUrl },
      }),
      replyTo: d.viratEmail,
    });
    await d.log('answer', `Assistant answered by email: ${a.answer}`);
    return { answered: true, answer: a.answer };
  }

  await d.send({
    to: member.email,
    subject: `Got your question: ${question.slice(0, 60)}`,
    html: renderRetailOsEmail({
      preheader: 'I have it and will reply myself.',
      eyebrow: 'Your question',
      heading: 'It is with me',
      lines: [`Hi ${first},`, `You asked: "${question}"`, 'My assistant did not have a sourced answer, so it has come to me directly. I will reply today. If it blocks a task, mark that task Blocked so it shows in my morning report.'],
      cta: { label: 'Back to your tracker', url: d.trackerUrl },
    }),
    replyTo: d.viratEmail,
  });
  await d.send({
    to: d.viratEmail,
    subject: `Nudge: ${member.name} needs an answer`,
    html: renderRetailOsEmail({
      preheader: question.slice(0, 90),
      eyebrow: 'Team · assistant could not answer',
      heading: `${member.name} asked`,
      lines: [question, a?.escalate?.why ?? 'The assistant could not reach the Brain.', `Reply to this email to answer ${first} directly. Once answered, add it to the FAQ so the assistant knows next time.`],
      cta: { label: 'Open the console', url: d.consoleUrl },
    }),
    replyTo: member.email,
  });
  await d.log('escalated', 'Assistant had no sourced answer; sent to Virat.');
  return { answered: false };
}
