/**
 * Drop templates — pick what you're selling and the create form configures
 * itself. Templates preset rights toggles and surface the fields that
 * matter, but never lock anything: Advanced stays editable, so every
 * template is a starting point rather than a straitjacket.
 */

export type DropTemplateId =
  | 'art'
  | 'writing'
  | 'music'
  | 'ticket'
  | 'coupon'
  | 'membership'
  | 'custom';

export interface DropTemplate {
  id: DropTemplateId;
  label: string;
  /** One-line summary shown in the hint drawer. */
  tagline: string;
  /** Longer hint drawer copy — what the template presets and why. */
  hint: string;
  /** Token provenance kind; null = derive from rights (custom). */
  kind: string | null;
  /** Supply noun — plural and singular. */
  unit: string;
  unitSingular: string;
  /** Rights presets applied on selection; null leaves the form untouched. */
  presets: {
    transferable: boolean;
    renewable: boolean;
    maxRedeems: string;
  } | null;
  /** Open Advanced on selection because it holds essential fields. */
  openAdvanced: boolean;
  /** Sale close required (event drops). */
  requiresEndTime?: boolean;
  /** Access end required (expiring drops). */
  requiresAccessEnd?: boolean;
}

export const DROP_TEMPLATES: DropTemplate[] = [
  {
    id: 'art',
    label: 'Artwork',
    tagline:
      'A supply-capped edition set fans mint until it sells out — with an optional open window.',
    hint: 'Every edition is tradable and permanent. Add a sale window in Advanced to run a timed drop, or leave it open until the supply runs out.',
    kind: 'art',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'writing',
    label: 'Writing',
    tagline:
      'A written work as a supply-capped edition — books, poems, essays, and more.',
    hint: 'Cover + Markdown: Article (one file) or Book (ordered chapters, up to 100). We pin the text for you — holders open the reader on the drop page. About stays public. Tradable by default; turn off transferable in Advanced for soulbound copies.',
    kind: 'writing',
    unit: 'copies',
    unitSingular: 'copy',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'music',
    label: 'Music',
    tagline:
      'A single or album — one cover, playable tracks, editions collectors keep.',
    hint: 'Pick Single (one track) or Album (two or more). Cover art fronts the drop in wallets; tracks play in OnSocial. Every edition shares the same release.',
    kind: 'music',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'ticket',
    label: 'Tickets',
    tagline: 'Event entry — one redeem per ticket. Set when sales close below.',
    hint: 'Each ticket redeems once at the door. Set the sale close to your event date, and cap per-wallet buys to stop scalping. Tickets stay tradable until they’re redeemed.',
    kind: 'ticket',
    unit: 'tickets',
    unitSingular: 'ticket',
    presets: { transferable: true, renewable: false, maxRedeems: '1' },
    openAdvanced: true,
    requiresEndTime: true,
  },
  {
    id: 'coupon',
    label: 'Coupons',
    tagline: 'Redeemable perks with an expiry — set when they expire below.',
    hint: 'Coupons redeem once and stop working after the access-end date. Good for discounts, freebies, and perks — the holder redeems, you honor it.',
    kind: 'coupon',
    unit: 'coupons',
    unitSingular: 'coupon',
    presets: { transferable: true, renewable: true, maxRedeems: '1' },
    openAdvanced: true,
    requiresAccessEnd: true,
  },
  {
    id: 'membership',
    label: 'Membership',
    tagline: 'Renewable passes that stay with the member.',
    hint: 'Passes are soulbound and renewable — members keep theirs and extend it. Set an access end in Advanced to run seasons or billing periods.',
    kind: 'membership',
    unit: 'passes',
    unitSingular: 'pass',
    presets: { transferable: false, renewable: true, maxRedeems: '' },
    openAdvanced: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    tagline: 'Every switch exposed — configure the drop yourself.',
    hint: 'Start from every switch open: transferability, renewals, redeems, allowlists, and sale windows. The rights you pick decide how the drop behaves in wallets.',
    kind: null,
    unit: 'editions',
    unitSingular: 'edition',
    presets: null,
    openAdvanced: true,
  },
];
