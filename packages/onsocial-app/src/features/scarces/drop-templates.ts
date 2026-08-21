/**
 * Drop templates — pick what you're selling and the create form configures
 * itself. Templates preset rights toggles and surface the fields that
 * matter, but never lock anything: Advanced stays editable, so every
 * template is a starting point rather than a straitjacket.
 *
 * Copy bar (hub-create style):
 * - tagline: one product sentence — shown under the kind tabs
 * - hint: presets + one “why” — InfoDrawer detail only (no field tours)
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
  /** One product sentence — kind lede + InfoDrawer summary. */
  tagline: string;
  /** Presets + one why — InfoDrawer detail only. */
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
    tagline: 'Supply-capped editions fans mint until sold out.',
    hint: 'Tradable and permanent by default. Optional sale window in Advanced.',
    kind: 'art',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'writing',
    label: 'Writing',
    tagline: 'A written work as capped editions — books, poems, essays.',
    hint: 'Article or Book with a cover. Tradable by default; soulbound in Advanced.',
    kind: 'writing',
    unit: 'copies',
    unitSingular: 'copy',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'audio',
    label: 'Audio',
    tagline: 'A single or album — one cover, playable tracks, shared release.',
    hint: 'Every edition gets the same tracks. Cover fronts wallets; play in OnSocial.',
    kind: 'audio',
    unit: 'editions',
    unitSingular: 'edition',
    presets: { transferable: true, renewable: false, maxRedeems: '' },
    openAdvanced: false,
  },
  {
    id: 'ticket',
    label: 'Tickets',
    tagline: 'Event entry — one redeem per ticket.',
    hint: 'Set the event window and place. Sale window is when fans can buy.',
    kind: 'ticket',
    unit: 'tickets',
    unitSingular: 'ticket',
    presets: { transferable: true, renewable: false, maxRedeems: '1' },
    openAdvanced: true,
    requiresEventEnd: true,
  },
  {
    id: 'coupon',
    label: 'Coupons',
    tagline: 'Redeemable perks with an expiry.',
    hint: 'Redeems once, then expires. Set access end in Advanced.',
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
    hint: 'Soulbound and renewable. Optional access end for seasons.',
    kind: 'membership',
    unit: 'passes',
    unitSingular: 'pass',
    presets: { transferable: false, renewable: true, maxRedeems: '' },
    openAdvanced: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    tagline: 'Every switch open — configure the drop yourself.',
    hint: 'Transfer, renewals, redeems, allowlists, sale windows — you pick the rights.',
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
