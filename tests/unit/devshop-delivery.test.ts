import { describe, it, expect } from 'vitest';
import {
  deliveryRecord, evaluateQa, canSendForReview, canAccept, canGoLive,
  QA_CHECKLIST, type Transition, type QaResult,
} from '../../src/lib/devshop-delivery';
import { isProtectedPath } from '../../src/lib/admin-auth';

// Build a transition list (stored newest-first, like the DB) from an ordered event log.
let clock = 0;
const ev = (tag: string, reasonExtra = ''): Transition =>
  ({ new_status: 'x', actor: 'admin', reason: `${tag}${reasonExtra}`, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, clock++)).toISOString() });
const newestFirst = (evs: Transition[]) => [...evs].reverse();

const allPass = (): QaResult => Object.fromEntries(QA_CHECKLIST.map((i) => [i.key, 'pass']));

describe('evaluateQa', () => {
  it('passes only when every item is pass/na and none failed', () => {
    expect(evaluateQa(allPass()).passed).toBe(true);
    expect(evaluateQa({ ...allPass(), integrations: 'na' }).passed).toBe(true);
    expect(evaluateQa({ ...allPass(), core_functionality: 'fail' }).passed).toBe(false);
    const missing = evaluateQa({ core_functionality: 'pass' });
    expect(missing.passed).toBe(false);
    expect(missing.missing.length).toBeGreaterThan(0);
  });
});

describe('delivery lifecycle (deterministic from events)', () => {
  it('A. build enters delivery: BUILD_STARTED → BUILDING', () => {
    const r = deliveryRecord('in_build', newestFirst([ev('BUILD_STARTED')]));
    expect(r.status).toBe('BUILDING');
  });

  it('B. ready for QA → INTERNAL_QA', () => {
    const r = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('BUILD_READY_FOR_QA')]));
    expect(r.status).toBe('INTERNAL_QA');
  });

  it('C. QA failure keeps it out of client review (gate closed)', () => {
    const r = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('BUILD_READY_FOR_QA'), ev('QA_FAILED')]));
    expect(r.qaPassedForCurrentBuild).toBe(false);
    expect(canSendForReview(r)).toMatch(/QA has not passed/);
  });

  it('D. QA pass permits client review', () => {
    const r = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED')]));
    expect(r.status).toBe('CLIENT_REVIEW');
    expect(canSendForReview(r)).toBeNull();
  });

  it('E. client cannot be marked accepted without review + QA', () => {
    const beforeReview = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED')]));
    expect(canAccept(beforeReview)).toMatch(/not been sent to the client/);
    const sent = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT')]));
    expect(sent.status).toBe('READY_FOR_ACCEPTANCE');
    expect(canAccept(sent)).toBeNull();
  });

  it('F. changes requested → REVISION, and revision must re-pass QA before review', () => {
    const changes = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('CHANGES_REQUESTED')]));
    expect(changes.status).toBe('REVISION');
    const revised = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('CHANGES_REQUESTED'), ev('REVISION_COMPLETED')]));
    expect(revised.qaPassedForCurrentBuild).toBe(false); // QA reset by the revision
    expect(canSendForReview(revised)).toMatch(/QA has not passed/);
    expect(revised.revision).toBe(1);
  });

  it('G. acceptance does NOT make the build live', () => {
    const accepted = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('BUILD_ACCEPTED')]));
    expect(accepted.status).toBe('READY_FOR_GO_LIVE');
    expect(accepted.live).toBe(false);
  });

  it('H. go-live requires acceptance, and produces LIVE', () => {
    const accepted = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('BUILD_ACCEPTED')]));
    expect(canGoLive(accepted)).toBeNull();
    const notAccepted = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED')]));
    expect(canGoLive(notAccepted)).toMatch(/not been accepted/);
    const live = deliveryRecord('delivered', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('BUILD_ACCEPTED'), ev('GO_LIVE_APPROVED')]));
    expect(live.status).toBe('LIVE');
  });

  it('I. a blocker surfaces with its reason', () => {
    const r = deliveryRecord('in_build', newestFirst([ev('BUILD_STARTED'), ev('BUILD_BLOCKED', ': waiting on client logo')]));
    expect(r.status).toBe('BLOCKED');
    expect(r.blocker).toContain('waiting on client logo');
  });

  it('J. duplicate/replayed events do not corrupt state (QA_PASSED twice = still CLIENT_REVIEW)', () => {
    const r = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('QA_PASSED')]));
    expect(r.status).toBe('CLIENT_REVIEW');
    // a re-accept after acceptance stays accepted, not double-counted
    const acc = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('BUILD_ACCEPTED'), ev('BUILD_ACCEPTED')]));
    expect(acc.accepted).toBe(true);
    expect(acc.status).toBe('READY_FOR_GO_LIVE');
  });

  it('K. a later CHANGES_REQUESTED reopens an accepted build', () => {
    const reopened = deliveryRecord('uat', newestFirst([ev('BUILD_STARTED'), ev('QA_PASSED'), ev('CLIENT_REVIEW_SENT'), ev('BUILD_ACCEPTED'), ev('CHANGES_REQUESTED')]));
    expect(reopened.accepted).toBe(false);
    expect(reopened.status).toBe('REVISION');
  });

  it('L. the delivery admin route is behind admin auth', () => {
    expect(isProtectedPath('/devshop/api/delivery')).toBe(true);
  });
});
