// The Brain's shared types and the ports other parts of the system plug into.

export type Visibility = 'public' | 'partner' | 'staff';
export type EntityKind = 'brand' | 'product' | 'vendor' | 'person' | 'customer' | 'channel' | 'term' | 'policy' | 'value';

/** Who is asking. 'staff' is honoured only when `authenticated` is true (checked by the caller's auth). */
export type Audience = { audience: Visibility; authenticated?: boolean; actor?: string };

export type Entity = {
  id: string; kind: EntityKind; name: string; aliases: string[];
  attributes: Record<string, unknown>; source: string; visibility: Visibility;
};

export type Fact = {
  id: string; entity_id?: string | null; topic?: string | null; statement: string;
  source: string; source_quote?: string | null; confidence: number;
  valid_from?: string; valid_to?: string | null; confirmed_by?: string | null; visibility: Visibility;
};

export type RuleMatch = { field: string; op: 'equals' | 'contains' | 'regex'; value: string };
export type Rule = {
  id: string; schema_name: string; match: RuleMatch; outcome: string; confidence: number;
  hits: number; last_used: string | null; created_from_correction: string | null;
  created_by: string; active: boolean; superseded_by?: string | null;
};

export type BrainEvent = { id?: string; type: string; actor?: string; payload: Record<string, unknown>; evidence?: string[]; visibility?: Visibility };

/** One retrieved piece of evidence. `id` is what callers cite. */
export type Evidence = { id: string; kind: string; title: string; body: string; source: string; score: number };

export type ClassifySchema = { name: string; labels: string[]; description?: string; highStakes?: boolean };
export type ClassifyResult = { answer: string | null; confidence: number; why: string[]; via: 'rule' | 'model' | 'none' };

export type Correction = {
  schema: string;                      // which classifier was corrected
  item: Record<string, unknown>;       // what was classified
  wrong?: string | null;               // what the Brain said
  right: string;                       // what it should have said
  by: string;                          // who corrected it (e.g. 'virat')
  match?: RuleMatch;                   // optional explicit rule; otherwise derived from the item
  note?: string;
};

export type Situation = {
  action: string;                      // what is about to be done
  details?: string;
  amountInr?: number;                  // any money involved
  reversible?: boolean;
  public?: boolean;                    // visible outside the business
  touchesCustomerData?: boolean;
  tags?: string[];                     // explicit categories: money, pricing, terms, legal, tax, public_claim, launch, hiring, investor, customer_data, irreversible
};
export type Decision = { verdict: 'act alone' | 'ask Virat'; reasons: string[]; checks: { step: number; name: string; ok: boolean; note: string }[] };

export type Recipient = {
  name: string; phone?: string; email?: string; timezone?: string; // IANA, default Asia/Kolkata
  firstContact?: boolean;
};
export type Purpose = {
  kind: string;                        // e.g. settlement_statement, order_update, reply, intro
  ref?: string;                        // stable id of the thing this is about (order id, week, thread)
  formal?: boolean; needsRecord?: boolean; timeSensitive?: boolean; urgent?: boolean;
  subject?: string;
};

// ---------------------------------------------------------------------------
// Ports implemented by the ledger / outbox agent (they own these).
// ---------------------------------------------------------------------------

export type Channel = 'whatsapp' | 'email';

/** What the Brain hands to notify(). Always sent as Virat. */
export type OutboundMessage = {
  channel: Channel;
  to: { name: string; phone?: string; email?: string };
  from: 'virat';
  subject?: string;
  body: string;
  sendAfter: string;                   // ISO timestamp, already inside the recipient's allowed hours
  dedupeKey: string;                   // outbox must drop a second message with the same key
  purpose: string;
};

/** Implemented by the outbox owner. The Brain never sends directly. */
export interface NotifyPort {
  notify(msg: OutboundMessage): Promise<{ id: string; status: 'queued' | 'duplicate' | 'rejected'; reason?: string }>;
}

/**
 * Optional feed of facts from systems the Brain doesn't own (ledger, settlements, brand_aliases,
 * vendor_brand_rules). Each fact must carry a source like `ledger:<row id>`.
 */
export interface FactSource {
  name: string;
  facts(): Promise<Array<Omit<Fact, 'id'>>>;
}

/** Optional: text embeddings for hybrid recall. Without it, recall is keyword/full-text only. */
export type Embedder = (text: string) => Promise<number[]>;
