# Communication & context layer — architecture boundary

Every communication (email, WhatsApp, support, agent message, approval request) enters the system through a channel and resolves to a person, a brand and a thread. It does not pass through an AI bot unless the communication type requires one. The layer classifies, it does not decide.

## Communication types

| Type | Description | Routed to |
|---|---|---|
| Context | Information that enriches a Work Item | Attached to the item |
| Question | Clarification needed before work continues | Appropriate responder (see below) |
| Instruction | Explicit direction from an authority | Work Item owner |
| Approval | Decision gate requiring named authority | Named approver (Virat, or specialist) |
| Decision | Recorded outcome of an approval | Work Item + audit trail |
| Work request | New work to be triaged | Work Registry (NEW) |
| Incident evidence | Operational incident data | Work Item of type incident |
| Relationship | Greeting, thanks, check-in — no work action | Acknowledged, not ticketed |
| Other | Unclassified | Triaged manually |

## Question routing

The appropriate responder depends on:

1. **Subject** — what the question is about (product, tech, finance, brand voice).
2. **Authority** — who has the knowledge or decision rights.
3. **Task** — which Work Item the question belongs to.
4. **Brand** — which brand context applies.

A question stays attached to its Work Item. There is no separate "question ticket". The responder is resolved at runtime from the subject and authority, not hard-coded per agent.

Examples:
- GST rate for Travaholic → Ishan Seth (brand founder).
- Shiprocket webhook failure → CTO / technical owner.
- Ad creative approval → Virat (if money) or CEO agent (if within guardrails).
- Brand voice question → brand book module, then founder if undefined.

## Prince / human execution model

Work → CTO or technical owner assigns → Prince executes (internal tech only) → Test → Verify → Close. Prince gets work only through Virat. The system does not hard-code responder relationships; it resolves them from Work Registry ownership and authority rules.

## What this layer is NOT

- Not a chatbot framework. Communication enters; classification happens; routing resolves. AI is used only when the communication type requires generation (e.g. drafting a reply for Virat's approval).
- Not a duplicate of the Work Registry. Communications attach to Work Items; they do not create a parallel tracking system.
- Not fully built. The type contracts and question routing are implemented in `src/lib/ceo/types.ts` and `src/lib/ceo/coordinator.ts`. Live email/WABA/WhatsApp routing is not connected.

## Implementation status

The communication context types are coded in `src/lib/ceo/types.ts`:
- `CommType`: 9 types (context, question, instruction, approval, decision, work_request, incident_evidence, relationship, other)
- `CommChannel`: email, whatsapp, command_centre, slack, internal
- `CommMessage`: full message shape with channel, actor, type, brand, work_id, thread_id
- `QuestionRouting`: technical→DS-02, brand→DS-02, financial→DS-13, strategic/prince/legal→DS-00
- `WorkQuestion`: question lifecycle (open→answered→superseded) within existing Work Items

Question creation and answering: `createQuestion()` and `answerQuestion()` in `src/lib/ceo/coordinator.ts`. Tested in Scenario C (ceo.test.ts).
