import { DEFAULT_ROYALTY_BPS } from '@/features/scarces/scarce-royalty';

/** Maker-page field order: the work, then the name, then the deal, then description. */
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

/** Description waits — open only when the maker asks, or when a draft already has one. */
export function dropCreateDescriptionOpen(
  description: string,
  forcedOpen = false
): boolean {
  return forcedOpen || Boolean(description.trim());
}

/** Disclosure stays Description. The chevron is the open and close. */
export function dropCreateDescriptionToggle(): 'Description' {
  return 'Description';
}

/** Placeholder in the open field. Writing adds where the manuscript goes. */
export function dropCreateDescriptionPlaceholder(isWriting: boolean): string {
  return isWriting
    ? 'Shown on the drop page. The manuscript uploads separately.'
    : 'Shown on the drop page.';
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

/** Piece count already fixed by the set. Null until that set exists. */
export function dropCreateSetDealCount({
  isVariations,
  fileCount,
  pinnedPieceCount,
  generatedCount,
}: {
  isVariations: boolean;
  fileCount: number;
  pinnedPieceCount: number;
  generatedCount: number;
}): number | null {
  if (!isVariations) return null;
  const known = [fileCount, pinnedPieceCount, generatedCount].find(
    (count) => Number.isSafeInteger(count) && count > 0
  );
  return known ?? null;
}

/** Read-only half of a set deal line: "5" + "pieces". */
export function dropCreateSetDealLabel(count: number): {
  value: string;
  unit: string;
} {
  return {
    value: count.toLocaleString(),
    unit: count === 1 ? 'piece' : 'pieces',
  };
}

/** Empty track / writing files sit on the piece — same voice as Add a description. */
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

/** Empty attach line — the file you are about to add. Preview and reorder live on the list. */
export type DropCreateAttachHintKind = 'single' | 'album' | 'issue' | 'book';

export function dropCreateAttachHint(
  kind: DropCreateAttachHintKind,
  limits: { maxTracks?: number; maxChapters?: number } = {}
): string {
  switch (kind) {
    case 'single':
      return 'MP3, M4A, WAV, or similar · ≤20 MB';
    case 'album':
      return `2–${limits.maxTracks ?? 30} tracks · MP3, M4A, WAV, or similar · ≤20 MB each`;
    case 'issue':
      return '.md for the reader · PDF ok · ≤500 KB text / 20 MB PDF';
    case 'book':
      return `2–${limits.maxChapters ?? 100} chapters · .md for reading`;
  }
}

/** Optional whole-book PDF waits in More. Chapters stay on the piece. */
export function dropCreateBookPdfPlacement(): 'more' {
  return 'more';
}

/** Collapsed extras. Royalty, sale, and transfer stay on the page. */
export function dropCreateMoreToggle(open: boolean): string {
  return open ? 'Hide more' : 'More';
}

/** A typed supply or price is a draft. Empty fields still submit as free. */
export function dropCreateDealDraftDirty(
  supply: string,
  price: string
): boolean {
  return Boolean(supply.trim() || price.trim());
}

/** Default 10% with no split is not a draft. A change or a split is. */
export function dropCreateRoyaltyDraftDirty(opts: {
  royaltyBps: number;
  isCustomRoyalty: boolean;
  shareCount: number;
}): boolean {
  return dropCreateRoyaltyOpen({
    royaltyBps: opts.royaltyBps,
    isCustomRoyalty: opts.isCustomRoyalty,
    isSplit: opts.shareCount > 0,
  });
}

/** Layers, trait images, or a generate in progress. Opening the studio is not. */
export function dropCreateDesignDraftDirty(
  design: { layers: number; traits: number; working: boolean } | null
): boolean {
  if (!design) return false;
  return design.working || design.layers > 0 || design.traits > 0;
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
  | 'place'
  | 'burnable';

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
      return opts.isTicket ? 'Allow postpone' : 'Set renewable';
    case 'allowlist':
      return 'Add an allowlist';
    case 'place':
      return 'Add a place';
    case 'burnable':
      return 'Set burnable';
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
  | 'perWallet'
  | 'transferable'
  | 'renewals'
  | 'place'
  | 'burnable'
  | 'setSource';

/** Short row label — the value on the right is what they picked. */
export function dropCreateExtraRowLabel(
  kind: DropCreateExtraSheetId | 'allowlist' | 'perWallet' | 'transferable',
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
    case 'perWallet':
      return 'Per wallet';
    case 'transferable':
      return 'Transferable';
    case 'renewals':
      return opts.isTicket ? 'Postpone' : 'Renewable';
    case 'allowlist':
      return 'Allowlist';
    case 'place':
      return 'Place';
    case 'burnable':
      return 'Burnable';
    case 'setSource':
      return 'Images';
  }
}

/** One quiet line in the extra drawer — not a second InfoDrawer. */
export function dropCreateExtraHint(
  kind: DropCreateExtraSheetId | 'event' | 'access' | 'allowlist',
  opts: { isTicket?: boolean } = {}
): string {
  switch (kind) {
    case 'dropId':
      return 'Filled from your title — edit only for a custom link.';
    case 'series':
      return 'Optional — group later drops under one name.';
    case 'facets':
      return 'Optional tags for discovery.';
    case 'royalty':
      return 'Creator cut on resales.';
    case 'saleRules':
      return 'When collectors can mint.';
    case 'perWallet':
      return 'Cap how many one wallet can collect, up to the edition count.';
    case 'transferable':
      return 'Yes lets them transfer and resell. No keeps the edition with them.';
    case 'renewals':
      return opts.isTicket
        ? 'Push the event end later if the show moves.'
        : 'Yes lets holders renew after it expires.';
    case 'place':
      return 'Optional venue — city, festival, or room.';
    case 'allowlist':
      return 'Early mint. Needs Opens in Sale.';
    case 'event':
      return 'When the show runs — not the sale.';
    case 'access':
      return 'When the offer ends — not the sale.';
    case 'burnable':
      return 'Yes lets the holder destroy their edition. Gone for good, no refund.';
    case 'setSource':
      return 'Upload finished images, or generate a set from stacked layers.';
  }
}

/** Closed set-source line. A pinned set stays on Generate layers. */
export function dropCreateSetSourceSummary(
  source: 'upload' | 'generate' | 'cid'
): 'Upload images' | 'Generate layers' {
  return source === 'upload' ? 'Upload images' : 'Generate layers';
}

export function dropCreateRenewalsHint(isTicket: boolean): string {
  return dropCreateExtraHint('renewals', { isTicket });
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

/**
 * Renewable / Postpone row. Tickets and coupons keep the date on its own
 * cell, so this row is only Yes or No. Membership can still name an optional end.
 */
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
  if (isTicket || requiresAccessEnd) return choice;
  const end = accessEndsLabel.trim();
  if (end) return `${choice} · ${end}`;
  return choice;
}

export function dropCreateSaleWindowSummary(
  opensLabel: string,
  closesLabel: string
): string {
  return `${opensLabel} · ${closesLabel}`;
}

/**
 * A ticket sale has to be open while the event is still ahead.
 * No scheduled close means the sale ends when the event ends.
 * Times are milliseconds. A null open means Now.
 */
export function dropCreateTicketSaleWindow(input: {
  saleOpensMs: number | null;
  saleClosesMs: number | null;
  eventEndsMs: number | null;
}): { error: string | null; closesMs: number | null } {
  const { saleOpensMs, saleClosesMs, eventEndsMs } = input;
  if (eventEndsMs == null) {
    return { error: null, closesMs: saleClosesMs };
  }
  if (saleOpensMs != null && saleOpensMs >= eventEndsMs) {
    return {
      error: 'The open time must be before the event ends.',
      closesMs: saleClosesMs,
    };
  }
  if (saleClosesMs != null && saleClosesMs > eventEndsMs) {
    return {
      error: 'The close time must be on or before the event end.',
      closesMs: saleClosesMs,
    };
  }
  return { error: null, closesMs: saleClosesMs ?? eventEndsMs };
}

/** Shown close. A ticket with no sale close uses the event end. */
export function dropCreateSaleCloseDisplay(input: {
  isTicket: boolean;
  endTimeLabel: string;
  eventEndsLabel: string;
  emptyLabel: string;
}): string {
  if (input.endTimeLabel.trim()) return input.endTimeLabel.trim();
  if (input.isTicket && input.eventEndsLabel.trim()) {
    return input.eventEndsLabel.trim();
  }
  return input.emptyLabel;
}

/**
 * Stored per-wallet cap. Empty and 0 mean no limit.
 * When the edition count is known, the cap cannot rise above it.
 */
export function dropCreatePerWalletInput(
  raw: string,
  supply: number | null
): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const count = Number.parseInt(digits, 10);
  const knownSupply =
    supply != null && Number.isSafeInteger(supply) && supply >= 1
      ? supply
      : null;
  if (!Number.isSafeInteger(count)) {
    return knownSupply == null ? '' : String(knownSupply);
  }
  if (knownSupply != null && count > knownSupply) return String(knownSupply);
  return String(count);
}

/** How far a finger moves before the piece lifts. A shorter move stays a tap. */
export const DROP_SET_REORDER_SLOP_PX = 8;
/** Still press lifts the piece in place, then a move reorders it. */
export const DROP_SET_REORDER_HOLD_MS = 180;

/**
 * A short move lifts the piece. Mouse is a few pixels; a finger needs
 * a little more so a tap still opens the piece. Holding still also lifts.
 */
export function dropSetReorderIntent(
  pointerType: string,
  dx: number,
  dy: number,
  held: boolean
): 'arm' | 'cancel' | 'wait' {
  const distance = Math.hypot(dx, dy);
  if (held && distance < DROP_SET_REORDER_SLOP_PX) return 'arm';
  if (pointerType === 'mouse') return distance >= 4 ? 'arm' : 'wait';
  if (distance >= DROP_SET_REORDER_SLOP_PX) return 'arm';
  return 'wait';
}

export function dropCreatePerWalletSummary(
  maxPerWallet: string,
  unit: string
): string {
  const count = dropCreatePerWalletInput(maxPerWallet, null);
  return count ? `${count} ${unit}` : 'No limit';
}

export function dropCreateTransferableSummary(transferable: boolean): string {
  return transferable ? 'Yes' : 'No';
}

/** Burnable row — No is the product default (editions stay). */
export function dropCreateBurnableSummary(burnable: boolean): string {
  return burnable ? 'Yes' : 'No';
}

/** Drop-page rights line. Same words as the create rows. */
export function dropRightsFacts({
  transferable,
  burnable,
  renewable,
  isTicket = false,
}: {
  transferable: boolean;
  burnable?: boolean | null;
  renewable: boolean;
  isTicket?: boolean;
}): string[] {
  return [
    transferable ? 'Transferable' : 'Not transferable',
    burnable === true ? 'Burnable' : burnable === false ? 'Not burnable' : null,
    renewable ? (isTicket ? 'Postpone' : 'Renewable') : null,
  ].filter((part): part is string => part != null);
}

export const DROP_CREATE_DEFAULT_BURNABLE = false;

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
  const parts = [dropCreateSaleWindowSummary(opensLabel, closesLabel)];
  const perWallet = dropCreatePerWalletInput(maxPerWallet, null);
  if (perWallet) {
    parts.push(dropCreatePerWalletSummary(perWallet, 'each'));
  }
  if (!transferable) parts.push(dropCreateTransferableSummary(false));
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
