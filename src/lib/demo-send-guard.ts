// Guards on the public DevShop intake's automatic first-demo email. Intake is
// open to anyone and the email goes out from Virat's Gmail, so the address must
// be exactly one mailbox (no header or multi-recipient injection), and the
// automatic send is capped: past a cap the demo is still generated and saved,
// but it waits in admin for the existing "Approve & send" button.

// One address, no whitespace/CR/LF, no list separators or display-name syntax.
const EMAIL_RE = /^[^\s@,;<>"'()\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isSingleEmailAddress(s: string): boolean {
  return s.length > 0 && s.length <= 254 && EMAIL_RE.test(s);
}

// Safety limits, not business targets. Real volume to date: 6 submissions in total.
export const AUTO_SEND_PER_ADDRESS_24H = 3; // submissions to one address, this one included
export const AUTO_SEND_GLOBAL_24H = 20; // automatic first-demo sends across all addresses

export type AutoSendCounts = { submissionsToAddress24h: number; autoSent24h: number };
export type AutoSendDecision = { send: true } | { send: false; reason: string };

export function autoSendDecision(c: AutoSendCounts): AutoSendDecision {
  if (c.submissionsToAddress24h > AUTO_SEND_PER_ADDRESS_24H) {
    return { send: false, reason: `more than ${AUTO_SEND_PER_ADDRESS_24H} submissions to this address in 24 hours` };
  }
  if (c.autoSent24h >= AUTO_SEND_GLOBAL_24H) {
    return { send: false, reason: `${AUTO_SEND_GLOBAL_24H} automatic demo emails already sent in 24 hours` };
  }
  return { send: true };
}
