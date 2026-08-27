/**
 * Drop templates — pick what you're selling and the create form configures
 * itself. Templates preset rights toggles and surface the fields that
 * matter, but never lock anything: Advanced stays editable, so every
 * template is a starting point rather than a straitjacket.
 *
 * Copy bar (hub-create style):
 * - tagline: one product sentence — shown under the kind tabs
 * - hint: use cases + example + defaults — InfoDrawer detail only (no field tours)
 * - helpTitle: InfoDrawer title — e.g. "Art drop", "Ticket drop"
 */

export type DropTemplateId =
  | 'art'
  | 'writing'
  | 'audio'
  | 'ticket'
  | 'coupon'
  | 'membership'
  | 'custom';

export interface DropTemplate {
  id: DropTemplateId;
  label: string;
  /** InfoDrawer title — e.g. "Art drop", "Ticket drop". */
  helpTitle: string;
  /** One product sentence — kind lede + InfoDrawer summary. */
  tagline: string;
  /** Use cases, example, and defaults — InfoDrawer detail only. */
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
  /** Event end required (tickets) — separate from sale close. */
  requiresEventEnd?: boolean;
  /** Access end required (expiring drops). */
  requiresAccessEnd?: boolean;
}

export const DROP_TEMPLATES: DropTemplate[] = [
  {
    id: 'art',
    label: 'Art',
    helpTitle: 'Art drop',
    tagline: 'Limited editions fans collect until they sell out.',
    hint:
      'Good for prints, photography, digital art, and posters. e.g. “Genesis Prints” — 25 editions at 1 NEAR. Tradable by default; optional sale window in Advanced.',
    kind: 'art',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'writing',
    label: 'Writing',
    helpTitle: 'Writing drop',
    tagline: 'Capped copies of a book, essay, or poem.',
    hint:
      'Good for ebooks, zines, and serialized essays. e.g. “Field Notes Vol. 1” — 100 copies with a cover image. Tradable by default; lock to holder in Advanced if you want.',
    kind: 'writing',
    unit: 'copies',
    unitSingular: 'copy',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'audio',
    label: 'Audio',
    helpTitle: 'Audio drop',
    tagline: 'One release — same tracks on every edition.',
    hint:
      'Good for singles, EPs, and albums. e.g. “Midnight EP” — cover art plus playable tracks in every edition. Fans play in OnSocial; optional sale window in Advanced.',
    kind: 'audio',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'ticket',
    label: 'Tickets',
    helpTitle: 'Ticket drop',
    tagline: 'Event entry — one redeem per ticket.',
    hint:
      'Good for shows, meetups, and conferences. e.g. “Neartopia Night” — 200 tickets, event end after doors close. Enable Allow date changes for postponements; sale window is buy-only.',
    kind: 'ticket',
    unit: 'tickets',
    unitSingular: 'ticket',
    presets: { transferable: true, renewable: true, maxRedeems: '1' },
    openAdvanced: true,
    requiresEventEnd: true,
  },
  {
    id: 'coupon',
    label: 'Coupons',
    helpTitle: 'Coupon drop',
    tagline: 'Redeemable perks with an expiry date.',
    hint:
      'Good for merch discounts, early access, and partner offers. e.g. “20% off studio gear” — one redeem per coupon, access ends when the offer does. Set the expiry in Advanced.',
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
    helpTitle: 'Membership drop',
    tagline: 'Renewable passes that stay with the member.',
    hint:
      'Good for fan clubs, seasons, and creator subscriptions. e.g. “Season Two Pass” — non-transferable, renewable each season. Optional access end in Advanced.',
    kind: 'membership',
    unit: 'passes',
    unitSingular: 'pass',
    presets: { transferable: false, renewable: true, maxRedeems: '' },
    openAdvanced: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    helpTitle: 'Custom drop',
    tagline: 'Start from scratch — you set the rules.',
    hint:
      'Good when no preset fits — bundles, experiments, or mixed media. e.g. combine transfer rules, renewals, redeem limits, allowlists, and sale windows yourself. Advanced opens by default.',
    kind: 'custom',
    unit: 'editions',
    unitSingular: 'edition',
    presets: null,
    openAdvanced: true,
  },
];

/** Supply noun from medium kind — same vocabulary as create-drop templates. */
export function supplyUnitForMediumKind(
  mediumKind: string | null | undefined
): { unit: string; unitSingular: string } {
  const key = (mediumKind ?? '').trim().toLowerCase();
  const match = DROP_TEMPLATES.find((t) => t.kind === key);
  if (match) return { unit: match.unit, unitSingular: match.unitSingular };
  if (key === 'thought') return { unit: 'copies', unitSingular: 'copy' };
  if (key === 'music') return { unit: 'editions', unitSingular: 'edition' };
  return { unit: 'editions', unitSingular: 'edition' };
}
