// Who exists and who may decide what. Taken from case-study/ORG-SOP.md and the `org_members` table
// (migrations/0053_org_board.sql). No new human owners are invented.

import type { Actor, Authority, HumanCoverage, Scope } from './types';

/** DS-00 Virat: founder, money, people, promises. */
export const VIRAT_ID = 'DS-00';
/** P-01 Prince Keshri: tech ops. Gets tasks only through Virat. */
export const PRINCE_ID = 'P-01';

export const isVirat = (a: Actor | null | undefined): boolean => !!a && a.kind === 'human' && a.id === VIRAT_ID;
export const isPrince = (a: Actor | null | undefined): boolean => !!a && a.id === PRINCE_ID;
export const sameActor = (a: Actor | null | undefined, b: Actor | null | undefined): boolean => !!a && !!b && a.id === b.id;

export const VIRAT: Actor = { kind: 'human', id: VIRAT_ID };
export const PRINCE: Actor = { kind: 'human', id: PRINCE_ID };

/** Optional check that an id is a real org member of the stated kind (the `org_members` table). */
export interface ActorDirectory { kindOf(id: string): 'agent' | 'human' | null }

/**
 * Who may decide each kind of approval. The Virat-only rows are the bold column of the decision-rights
 * table in ORG-SOP.md (spend, prices and offers, anything sent to a brand/founder/client, posts on
 * his handles, work for Prince, new brands/markets/channels, terms/NDAs/legal/equity/hiring,
 * anything irreversible). Virat, as founder, may also decide the specialist ones.
 */
export const AUTHORITY_HOLDERS: Record<Authority, readonly HumanCoverage[]> = {
  money: ['virat'], pricing: ['virat'], outbound_comms: ['virat'], social_post: ['virat'], prince_assignment: ['virat'],
  expansion: ['virat'], terms_legal: ['virat'], irreversible: ['virat'], strategic: ['virat'],
  accounting_tax: ['khiwani', 'virat'],
  legal_opinion: ['legal', 'virat'],
  brand_judgement: ['brand_founder', 'virat'],
  technical_deployment: ['prince', 'virat'],
};

/** Does this actor stand in for this human coverage on this work? */
export function actorCoversCoverage(actor: Actor, coverage: HumanCoverage, scope: Scope): boolean {
  switch (coverage) {
    case 'virat': return isVirat(actor);
    case 'prince': return actor.kind === 'human' && actor.id === PRINCE_ID;
    case 'khiwani': return actor.kind === 'external' && actor.id === 'external:khiwani';
    case 'legal': return actor.kind === 'external' && actor.id === 'external:legal';
    case 'brand_founder':
      return actor.kind === 'external' && actor.id.startsWith('external:founder:') &&
        (scope.brand === null || actor.id === `external:founder:${scope.brand}`);
  }
}

/** The actor id an escalation to this coverage is addressed to (for display and routing). */
export function coverageLabel(c: HumanCoverage): string {
  return { virat: 'Virat', prince: 'Prince', khiwani: 'Khiwani & Co.', legal: 'Legal advisers', brand_founder: 'Brand founder' }[c];
}

export const isAccountableKind = (a: Actor): boolean => a.kind === 'agent' || a.kind === 'human';

/**
 * Actor ids are references (org ids, external:<role>, system:<name>), never raw personal data. Work about a
 * brand is held centrally, so an email address or phone number must not become an identifier here.
 */
export function actorIdLooksPersonal(id: string): boolean {
  return /@/.test(id) || /^\+?[\d][\d\s().-]{7,}$/.test(id.replace(/^external:/, ''));
}
