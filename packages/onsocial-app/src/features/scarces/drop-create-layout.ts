import { DEFAULT_ROYALTY_BPS } from '@/features/scarces/scarce-royalty';

/** Maker-page field order: the work, then the name, then the deal, then the blurb. */
export const DROP_CREATE_SECTION_ORDER = [
  'work',
  'title',
  'deal',
  'description',
] as const;

export type DropCreateSection = (typeof DROP_CREATE_SECTION_ORDER)[number];

export function dropCreateScreenTitle(studioOpen: boolean): string {
  return studioOpen ? 'Design your set' : 'New drop';
}

/** Blurb waits — open only when the maker asks, or when a draft already has one. */
export function dropCreateBlurbOpen(
  description: string,
  forcedOpen = false
): boolean {
  return forcedOpen || Boolean(description.trim());
}

/** Empty artwork/cover sits on the piece. Studio stay a launch card. */
export function dropCreatePiecePickerClass(
  kind: 'piece' | 'studio' = 'piece'
): string {
  return kind === 'studio'
    ? 'drop-cover-picker drop-studio-launch'
    : 'drop-cover-picker drop-create-piece';
}

/** Supply is a typed field on the deal line — not a studio/set note. */
export function dropCreateDealShowsSupplyField({
  isGeneratedSet,
  isVariations,
}: {
  isGeneratedSet: boolean;
  isVariations: boolean;
}): boolean {
  return !isGeneratedSet && !isVariations;
}

/** Empty track / writing files sit on the piece — same voice as Add a blurb. */
export type DropCreateAttachAction =
  | 'track'
  | 'tracks'
  | 'file'
  | 'files'
  | 'pdf';

export function dropCreateAttachAction(kind: DropCreateAttachAction): string {
  switch (kind) {
    case 'track':
      return 'Add track';
    case 'tracks':
      return 'Add tracks';
    case 'file':
      return 'Add file';
    case 'files':
      return 'Add files';
    case 'pdf':
      return 'Add PDF';
  }
}

/** Optional whole-book PDF waits in Advanced. Chapters stay on the piece. */
export function dropCreateBookPdfPlacement(): 'advanced' {
  return 'advanced';
}

/** Optional Advanced extras wait — open when the maker asks, or a draft already has one. */
export function dropCreateAdvancedExtraOpen(
  value: string,
  forcedOpen = false
): boolean {
  return forcedOpen || Boolean(value.trim());
}

export type DropCreateAdvancedExtra =
  | 'dropId'
  | 'series'
  | 'royalty'
  | 'saleRules'
  | 'renewals'
  | 'allowlist'
  | 'place';

export function dropCreateAdvancedExtraAction(
  kind: DropCreateAdvancedExtra,
  opts: { isTicket?: boolean } = {}
): string {
  switch (kind) {
    case 'dropId':
      return 'Set a drop ID';
    case 'series':
      return 'Add to a series';
    case 'royalty':
      return 'Set a royalty';
    case 'saleRules':
      return 'Set sale rules';
    case 'renewals':
      return opts.isTicket ? 'Allow date changes' : 'Set renewals';
    case 'allowlist':
      return 'Add an allowlist';
    case 'place':
      return 'Add a place';
  }
}

/** Postpone / renewals — Yes means you can push the end later. */
export function dropCreateRenewalsChoice(on: boolean): string {
  return on ? 'Yes' : 'No';
}

export type DropCreateExtraSheetId =
  | 'dropId'
  | 'series'
  | 'facets'
  | 'royalty'
  | 'saleRules'
  | 'renewals'
  | 'place';

/** Short row label — the value on the right is what they picked. */
export function dropCreateExtraRowLabel(
  kind: DropCreateExtraSheetId | 'allowlist',
  opts: { isTicket?: boolean; facetLabel?: string } = {}
): string {
  switch (kind) {
    case 'dropId':
      return 'Drop ID';
    case 'series':
      return 'Series';
    case 'facets':
      return opts.facetLabel?.trim() || 'Style';
    case 'royalty':
      return 'Royalty';
    case 'saleRules':
      return 'Sale';
    case 'renewals':
      return opts.isTicket ? 'Postpone' : 'Renewals';
    case 'allowlist':
      return 'Allowlist';
    case 'place':
      return 'Place';
  }
}

export function dropCreateRenewalsHint(isTicket: boolean): string {
  return isTicket
    ? 'Can you push the event end later if the show moves?'
    : 'Can holders renew this after it expires?';
}

export function dropCreateDropIdSummary(slug: string): string {
  return slug.trim() || 'From title';
}

export function dropCreateOptionalSummary(value: string): string {
  return value.trim() || 'None';
}

export function dropCreateFacetsSummary(
  facets: readonly string[],
  labelFor?: (slug: string) => string | null
): string {
  if (facets.length === 0) return 'None';
  return facets.map((slug) => labelFor?.(slug)?.trim() || slug).join(' · ');
}

export function dropCreateAllowlistSummary(
  count: number,
  connected = true
): string {
  if (!connected) return 'Connect';
  if (count <= 0) return 'None';
  return count === 1 ? '1 account' : `${count} accounts`;
}

/** Renewals / Postpone row — say the expiry when the kind needs one. */
export function dropCreateRenewalsSummary({
  on,
  isTicket = false,
  accessEndsLabel = '',
  requiresAccessEnd = false,
}: {
  on: boolean;
  isTicket?: boolean;
  accessEndsLabel?: string;
  requiresAccessEnd?: boolean;
}): string {
  const choice = dropCreateRenewalsChoice(on);
  if (isTicket) return choice;
  const end = accessEndsLabel.trim();
  if (end) return `${choice} · ${end}`;
  if (requiresAccessEnd) return `${choice} · set an end`;
  return choice;
}

export function dropCreateSaleRulesSummary({
  opensLabel,
  closesLabel,
  maxPerWallet,
  transferable,
}: {
  opensLabel: string;
  closesLabel: string;
  maxPerWallet: string;
  transferable: boolean;
}): string {
  const parts = [`${opensLabel} · ${closesLabel}`];
  if (maxPerWallet.trim()) parts.push(`${maxPerWallet.trim()} each`);
  if (!transferable) parts.push('Soulbound');
  return parts.join(' · ');
}

export function dropCreateRoyaltySummary({
  percentLabel,
  isNone,
  splitCount,
}: {
  percentLabel: string;
  isNone: boolean;
  splitCount: number;
}): string {
  if (isNone) return 'None';
  if (splitCount > 1) return `${percentLabel} · ${splitCount} recipients`;
  return percentLabel;
}

/** Sale window waits — default is now / no end until the maker asks or sets one. */
export function dropCreateSaleWindowOpen(
  startTime: string,
  endTime: string,
  forcedOpen = false
): boolean {
  return forcedOpen || Boolean(startTime.trim() || endTime.trim());
}

/** Sale rules wait — window, wallet cap, and transfer stay default until asked. */
export function dropCreateSaleRulesOpen({
  startTime,
  endTime,
  maxPerWallet,
  transferable,
  defaultTransferable = true,
  forcedOpen = false,
}: {
  startTime: string;
  endTime: string;
  maxPerWallet: string;
  transferable: boolean;
  defaultTransferable?: boolean;
  forcedOpen?: boolean;
}): boolean {
  return (
    dropCreateSaleWindowOpen(startTime, endTime, forcedOpen) ||
    Boolean(maxPerWallet.trim()) ||
    transferable !== defaultTransferable
  );
}

/** Renewals wait — default off / no cap until the maker asks or a kind needs them. */
export function dropCreateRenewalsOpen({
  renewable,
  defaultRenewable = false,
  maxRedeems,
  accessEnds,
  requiresAccessEnd = false,
  forcedOpen = false,
}: {
  renewable: boolean;
  defaultRenewable?: boolean;
  maxRedeems: string;
  accessEnds: string;
  requiresAccessEnd?: boolean;
  forcedOpen?: boolean;
}): boolean {
  return (
    forcedOpen ||
    requiresAccessEnd ||
    renewable !== defaultRenewable ||
    Boolean(maxRedeems.trim() || accessEnds.trim())
  );
}

/** Allowlist waits — open when the maker asks, or a draft already has accounts. */
export function dropCreateAllowlistOpen(
  accountCount: number,
  forcedOpen = false
): boolean {
  return forcedOpen || accountCount > 0;
}

/** Royalty pills wait — default 10% stays unless the maker asks or changed it. */
export function dropCreateRoyaltyOpen({
  royaltyBps,
  isCustomRoyalty,
  isSplit = false,
  forcedOpen = false,
}: {
  royaltyBps: number;
  isCustomRoyalty: boolean;
  isSplit?: boolean;
  forcedOpen?: boolean;
}): boolean {
  return (
    forcedOpen ||
    isCustomRoyalty ||
    isSplit ||
    royaltyBps !== DEFAULT_ROYALTY_BPS
  );
}

/** Facet chips wait — open when the maker asks, or a draft already picked some. */
export function dropCreateFacetsOpen(
  facets: readonly string[],
  forcedOpen = false
): boolean {
  return forcedOpen || facets.length > 0;
}

/** Add-toggle copy from the field label (Style → Add a style). */
export function dropCreateFacetsAction(fieldLabel: string): string {
  const word = fieldLabel.trim().toLowerCase();
  if (!word) return 'Add a category';
  if (word === 'access') return 'Add access';
  if (word === 'occasion' || word === 'offer') return `Add an ${word}`;
  return `Add a ${word}`;
}
