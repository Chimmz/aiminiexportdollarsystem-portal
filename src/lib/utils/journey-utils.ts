// Two fixed-step progress trackers (see supabase/migrations/
// 0006_journey_progress.sql, widened in
// 0009_scale_specific_journey_steps.sql) so the mentor can lead the user
// through a known sequence instead of re-deriving "where are they" from
// chat history on every message. Step keys are fixed here, not DB-editable,
// same convention as ALL_CONTACT_TYPES in contacts-utils.ts.
//
// Small-scale and large-scale export are genuinely different journeys, not
// the same checklist with more or less effort -- large scale has
// compulsory steps (an LLC, an NXP account) that don't apply at small
// scale at all, and a formal proposal/quotation/contract procedure in
// place of "attract buyer and quote". So each track gets its own step-key
// set (prefixed small_/large_) rather than one generic sequence with
// scale-conditional descriptions. Which track applies to a given user is
// stored as a profile fact (factType "export_scale", see config.ts's
// MEMORY section), not a column here -- it's conceptually just another
// thing learned about the user, same as their product or country.

export type ExportScale = 'small' | 'large';

export interface StepDef<K extends string> {
  key: K;
  label: string;
}

export type SmallSetupStepKey =
  | 'small_decide_product'
  | 'small_decide_country'
  | 'small_register_business'
  | 'small_open_account'
  | 'small_build_presence_and_advertise'
  | 'small_get_fda';

export type LargeSetupStepKey =
  | 'large_decide_product'
  | 'large_decide_country'
  | 'large_register_llc'
  | 'large_open_corporate_account_nxp'
  | 'large_get_fda';

export type SetupStepKey = SmallSetupStepKey | LargeSetupStepKey;

const SMALL_SETUP_STEPS: StepDef<SmallSetupStepKey>[] = [
  {
    key: 'small_decide_product',
    label: 'Decide what product to export and confirm real demand and a wholesale sourcing price',
  },
  { key: 'small_decide_country', label: 'Decide which country or market to target' },
  {
    key: 'small_register_business',
    label: 'Register a business (CAC) -- enterprise or business name is enough at this scale',
  },
  { key: 'small_open_account', label: 'Open a domiciliary or foreign-currency account' },
  {
    key: 'small_build_presence_and_advertise',
    label: 'Build a public presence (catalogue, social page or flyer) and start advertising to buyers',
  },
  {
    key: 'small_get_fda',
    label: 'Get FDA registration, if putting your own brand/label on the product',
  },
];

// LLC and the corporate/NXP account are compulsory here, unlike small
// scale -- the material is explicit enterprise/business name "will not
// work" for large scale. NEPC is deliberately NOT a setup step: the
// material advises against getting it before a contract is in hand, since
// it expires in two years and is quick (24-48hrs) to obtain once needed --
// see large_source in LARGE_DEAL_STEPS below instead.
const LARGE_SETUP_STEPS: StepDef<LargeSetupStepKey>[] = [
  { key: 'large_decide_product', label: 'Decide what product to export and confirm supply capacity' },
  { key: 'large_decide_country', label: 'Decide which country or buyer category to target' },
  {
    key: 'large_register_llc',
    label: 'Register a Limited Liability Company (CAC) -- enterprise/business name does not qualify at this scale',
  },
  {
    key: 'large_open_corporate_account_nxp',
    label: 'Open a corporate domiciliary account and an NXP (Nigeria Export Proceed) account',
  },
  {
    key: 'large_get_fda',
    label: 'Get FDA registration, if putting your own brand/label on the product',
  },
];

export const SETUP_STEPS_BY_SCALE: Record<ExportScale, StepDef<SetupStepKey>[]> = {
  small: SMALL_SETUP_STEPS,
  large: LARGE_SETUP_STEPS,
};

// Flat union of both tracks' steps -- used only where every valid key
// needs to be expressible at once, such as manage-memory-tool.ts's zod
// enum. Reading/display always goes through SETUP_STEPS_BY_SCALE[scale]
// instead, which is the one track that's actually relevant to a given
// user.
export const ALL_SETUP_STEPS: StepDef<SetupStepKey>[] = [...SMALL_SETUP_STEPS, ...LARGE_SETUP_STEPS];

export type SmallDealStepKey =
  | 'small_attract_buyer_and_quote'
  | 'small_get_paid'
  | 'small_source'
  | 'small_pack'
  | 'small_ship';

export type LargeDealStepKey =
  | 'large_attract_buyer_and_quote'
  | 'large_negotiate_and_sign_contract'
  | 'large_get_paid'
  | 'large_source'
  | 'large_pack'
  | 'large_ship';

export type DealStepKey = SmallDealStepKey | LargeDealStepKey;

const SMALL_DEAL_STEPS: StepDef<SmallDealStepKey>[] = [
  { key: 'small_attract_buyer_and_quote', label: 'Attract a buyer and send a price quote' },
  {
    key: 'small_get_paid',
    label: 'Get paid (usually near-full payment upfront at this scale) before shipping',
  },
  { key: 'small_source', label: 'Source the goods from a supplier' },
  { key: 'small_pack', label: 'Pack the goods for export' },
  {
    key: 'small_ship',
    label: 'Hand the goods to a logistics company to ship -- their documents cover the shipment',
  },
];

// Mirrors the material's own "Proposal -> LOI/RFQ -> Quotation -> Draft
// contract -> Lawyer review -> Negotiation -> Signed contract -> Export
// commences" procedure, collapsed into one tracked step
// (large_negotiate_and_sign_contract) rather than one row per
// back-and-forth -- the sub-stages are detail worth noting on that step,
// not separate milestones to check off. NEPC licence lives inside
// large_source's description rather than its own step, since the material
// says to get it only once a contract is secured, not as a separate
// milestone -- see the comment on LARGE_SETUP_STEPS above for the same
// reasoning on why it isn't a setup step either.
const LARGE_DEAL_STEPS: StepDef<LargeDealStepKey>[] = [
  {
    key: 'large_attract_buyer_and_quote',
    label: 'Send a proposal or quotation (or respond to one, if the buyer found you first)',
  },
  {
    key: 'large_negotiate_and_sign_contract',
    label: 'Negotiate the draft contract and get it signed by both parties',
  },
  {
    key: 'large_get_paid',
    label: "Get paid or have escrow/LC funded, per the signed contract's terms, before shipping",
  },
  {
    key: 'large_source',
    label: 'Source the goods -- also when to apply for the NEPC export licence, now that a contract is in hand',
  },
  { key: 'large_pack', label: 'Pack the goods for export' },
  { key: 'large_ship', label: 'Ship the goods' },
];

export const DEAL_STEPS_BY_SCALE: Record<ExportScale, StepDef<DealStepKey>[]> = {
  small: SMALL_DEAL_STEPS,
  large: LARGE_DEAL_STEPS,
};

export const ALL_DEAL_STEPS: StepDef<DealStepKey>[] = [...SMALL_DEAL_STEPS, ...LARGE_DEAL_STEPS];

export type StepStatus = 'not_started' | 'in_progress' | 'done';

export interface StepProgress {
  status: StepStatus;
  detail: string | null;
}

export interface JourneyProgress {
  scale: ExportScale;
  setup: Record<string, StepProgress>;
  deal: Record<string, StepProgress>;
}

// Shared with journey-actions.ts's getJourneyProgress -- the shape every
// step defaults to before any DB row overrides it.
export function defaultProgress(keys: string[]): Record<string, StepProgress> {
  return Object.fromEntries(keys.map((k) => [k, { status: 'not_started' as StepStatus, detail: null }]));
}

function statusLabel(status: StepStatus): string {
  return { not_started: 'not started', in_progress: 'in progress', done: 'done' }[status];
}

// Dynamic, per-user text injected at the very end of the system prompt
// (see config.ts) for the same caching reason userFirstName sits there:
// anything that varies per request breaks prompt caching for everything
// after it, so it goes last.
export function formatJourneyProgressForPrompt(progress: JourneyProgress): string {
  const setupSteps = SETUP_STEPS_BY_SCALE[progress.scale];
  const dealSteps = DEAL_STEPS_BY_SCALE[progress.scale];

  const setupLines = setupSteps
    .map((step, i) => {
      const p = progress.setup[step.key];
      const detail = p.detail ? ` (${p.detail})` : '';
      return `${i + 1}. ${step.label} [${statusLabel(p.status)}]${detail}`;
    })
    .join('\n');

  const dealLines = dealSteps
    .map((step, i) => {
      const p = progress.deal[step.key];
      const detail = p.detail ? ` (${p.detail})` : '';
      return `${i + 1}. ${step.label} [${statusLabel(p.status)}]${detail}`;
    })
    .join('\n');

  const scaleLabel = progress.scale === 'small' ? 'small-scale' : 'large-scale';
  return `Export scale: ${scaleLabel}\n\nGetting started (one-time, done once ever, before their first deal):\n${setupLines}\n\nCurrent deal (repeats every deal):\n${dealLines}`;
}

// Which progress table a step belongs to -- see journey-actions.ts's
// updateStepProgress, the one write path for both tracks.
export type ProgressTrack = 'setup' | 'deal';
