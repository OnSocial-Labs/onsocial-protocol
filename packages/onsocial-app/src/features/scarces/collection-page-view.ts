import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { APP_DROPS_PATH, collectionPath } from '@/lib/app-routes';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import type { CollectiblesNowPlayingSession } from '@/contexts/collectibles-now-playing-context';
import type { CollectionView } from '@/features/scarces/collections-data';

/** `?t=` only when it names this drop. */
export function editionTokenForCollection(
  collectionId: string,
  raw: string | null | undefined
): string {
  const token = raw?.trim() || '';
  const owner = collectionIdFromTokenId(token);
  return owner != null && owner === collectionId.trim() ? token : '';
}

/** Playable cover — clips / albums count as audio for square + tracks chrome. */
export function collectionCoverIsAudio(opts: {
  kind?: string | null;
  playablesLength?: number;
}): boolean {
  const mediumKind = (opts.kind ?? '').trim().toLowerCase();
  return (
    (opts.playablesLength ?? 0) > 0 ||
    mediumKind === 'audio' ||
    mediumKind === 'music'
  );
}

/** Art matches create-drop / wallets: inset 1×1. Audio is also square. */
export function collectionCoverSquare(opts: {
  kind?: string | null;
  isAudio: boolean;
}): boolean {
  if (opts.isAudio) return true;
  return (opts.kind ?? '').trim().toLowerCase() === 'art';
}

/**
 * Aa / thought cards — inset object, not immersive album bleed.
 * `cardBg` when theme was stamped; `thought`/`writing` for from-post text.
 */
export function collectionCoverIsTextCard(opts: {
  kind?: string | null;
  cardBg?: string | null;
  isAudio: boolean;
}): boolean {
  if (opts.isAudio) return false;
  const mediumKind = (opts.kind ?? '').trim().toLowerCase();
  return (
    Boolean(opts.cardBg?.trim()) ||
    mediumKind === 'thought' ||
    mediumKind === 'writing'
  );
}

/** Art stays an inset square — no 16/10 immersive bleed. */
export function collectionCoverImmersive(opts: {
  hasMedia: boolean;
  kind?: string | null;
}): boolean {
  if (!opts.hasMedia) return false;
  return (opts.kind ?? '').trim().toLowerCase() !== 'art';
}

export type CollectionCoverExpandAction = 'artwork' | null;

/** Writing kind always opens Read — even before chapters hydrate. */
export function collectionOpensWritingReader(opts: {
  kind?: string | null;
  hasReadables: boolean;
}): boolean {
  if (opts.hasReadables) return true;
  return (opts.kind ?? '').trim().toLowerCase() === 'writing';
}

/**
 * Drop cover hit. The picture opens the larger picture.
 * Read, Play, and Show pass stay on the labeled actions under the cover.
 */
export function collectionCoverExpandAction(opts: {
  hasMedia: boolean;
}): CollectionCoverExpandAction {
  return opts.hasMedia ? 'artwork' : null;
}

/**
 * Drop-page ownership for layout.
 * - `holder` — creator or confirmed edition hold (Play / Read first)
 * - `visitor` — settled non-holder (inline tracks preview)
 * - `unknown` — wallet or ownership still resolving (no visitor flash)
 */
export type CollectionOwnership = 'unknown' | 'visitor' | 'holder';

export function resolveCollectionOwnership(opts: {
  isOwner: boolean;
  /** null = unchecked; true/false after seed or chain scan. */
  holdsEdition: boolean | null;
  walletLoading: boolean;
  viewerAccountId?: string | null;
  /** View drop — now-playing session is this collection. */
  playSessionMatches?: boolean;
}): CollectionOwnership {
  if (opts.isOwner || opts.holdsEdition === true) return 'holder';
  if (
    opts.holdsEdition == null &&
    Boolean(opts.viewerAccountId?.trim()) &&
    opts.playSessionMatches
  ) {
    return 'holder';
  }
  if (opts.walletLoading) return 'unknown';
  if (opts.holdsEdition == null && Boolean(opts.viewerAccountId?.trim())) {
    return 'unknown';
  }
  return 'visitor';
}

/** Holder / creator — Play / Read / Show pass first, commerce second. */
export function collectionUseFirst(ownership: CollectionOwnership): boolean {
  return ownership === 'holder';
}

/** Track list stays on the drop for every viewer. Play still opens the play page for a holder. */
export function collectionShowInlineTracks(opts: {
  hasPlayables: boolean;
}): boolean {
  return opts.hasPlayables;
}

/** First paint after an SSR catalog miss — skeleton until the client settles. */
export function collectionCatalogShell(opts: {
  hasView: boolean;
  ssrMiss: boolean;
  clientSettled: boolean;
}): 'drop' | 'skeleton' | 'unavailable' {
  if (opts.hasView) return 'drop';
  if (opts.ssrMiss && !opts.clientSettled) return 'skeleton';
  return 'unavailable';
}

/**
 * Route `loading.tsx` already paints cold skeleton or the seeded drop panel.
 * The panel must not SSR a second skeleton during that handoff. Appear-over /
 * post-hydrate miss still owns the skeleton (no loading.tsx there).
 */
export function collectionRouteYieldsLoadingSkeleton(opts: {
  embedded: boolean;
  clientMounted: boolean;
}): boolean {
  return !opts.embedded && !opts.clientMounted;
}

/** Holders go back to the vault; visitors stay on Drops. */
export function collectionDropBackHref(opts: {
  useFirst: boolean;
  viewerAccountId?: string | null;
}): string {
  const account = opts.viewerAccountId?.trim();
  if (opts.useFirst && account) return portfolioCollectiblesPath(account);
  return APP_DROPS_PATH;
}

/** Door / redeem loading — leave to the drop when the id is known. */
export function collectionChildLeaveHref(collectionId?: string | null): string {
  const id = collectionId?.trim();
  return id ? collectionPath(id) : APP_DROPS_PATH;
}

function itemCollectionId(item: {
  collectionId?: string | null;
  tokenId: string;
}): string {
  return (
    item.collectionId?.trim() || collectionIdFromTokenId(item.tokenId) || ''
  );
}

/** Sync peek — coming from Collectibles must not flash visitor commerce. */
export function peekHoldsCollection(
  accountId: string | null | undefined,
  collectionId: string
): boolean {
  const owner = accountId?.trim();
  const id = collectionId.trim();
  if (!owner || !id) return false;
  const page = peekOwnedVaultPage(owner);
  if (!page) return false;
  return page.items.some((item) => itemCollectionId(item) === id);
}

function peekStoredWalletAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

/**
 * Live wallet id when present, else last persisted session account.
 * Same cold seed as hold / #edition — Open Collectibles must not wait on hydrate.
 */
export function peekViewerAccountId(
  accountId?: string | null
): string | null {
  const live = accountId?.trim();
  if (live) return live;
  return peekStoredWalletAccountId()?.trim() || null;
}

/**
 * First-paint hold seed. Live account when present, else persisted wallet id
 * so refresh doesn’t treat a holder as a visitor for one frame.
 */
export function peekHoldsCollectionForDropPage(
  accountId: string | null | undefined,
  collectionId: string
): boolean {
  if (peekHoldsCollection(accountId, collectionId)) return true;
  return peekHoldsCollection(peekStoredWalletAccountId(), collectionId);
}

export function peekOwnedTokenForCollection(
  accountId: string | null | undefined,
  collectionId: string
): string | null {
  const id = collectionId.trim();
  if (!id) return null;
  // Same cold-wallet seed as hold: live account, else persisted wallet id.
  const owners = [accountId?.trim(), peekStoredWalletAccountId()].filter(
    (value): value is string => Boolean(value?.trim())
  );
  for (const owner of owners) {
    const page = peekOwnedVaultPage(owner);
    const tokenId =
      page?.items.find((item) => itemCollectionId(item) === id)?.tokenId?.trim() ||
      null;
    if (tokenId) return tokenId;
  }
  return null;
}

/** Shared placeholder — cover/title/tracks paint; commerce soft-fills. */
function collectionViewPlaceholder(input: {
  collectionId: string;
  title: string;
  mediaUrl: string | null;
  creatorId?: string;
  appId?: string | null;
  kind?: string | null;
  audioFormat?: CollectionView['audioFormat'];
  playables?: CollectionView['playables'];
  description?: string | null;
}): CollectionView {
  const description = input.description?.trim() || undefined;
  return {
    collectionId: input.collectionId,
    creatorId: input.creatorId?.trim() || '',
    title: input.title,
    mediaUrl: input.mediaUrl,
    ...(description ? { description } : {}),
    priceNear: null,
    priceYocto: '0',
    totalSupply: 0,
    minted: 0,
    remaining: 0,
    startTimeMs: null,
    endTimeMs: null,
    createdAtMs: 0,
    maxPerWallet: null,
    mintMode: 'public',
    paused: false,
    cancelled: false,
    soldOut: false,
    hasAllowlist: false,
    appId: input.appId?.trim() || null,
    appCommissionBps: null,
    kind: input.kind ?? null,
    audioFormat: input.audioFormat ?? null,
    facets: [],
    playables: input.playables ?? [],
    readables: [],
    bookPdf: null,
    writingFormat: null,
    writingManifestCid: null,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    isVariations: false,
    randomAssignment: false,
    seriesId: null,
    seriesTitle: null,
    eventStartsAtMs: null,
    eventEndsAtMs: null,
    eventEndsAtPreviousMs: null,
    eventStartsAtPreviousMs: null,
    place: null,
    accessEndsAtMs: null,
    royalty: null,
  };
}

/**
 * Optimistic view seed when navigating from Now Playing ("View drop").
 * Paints the album cover, title, and tracks on frame 1 without a skeleton flash.
 */
export function seedCollectionViewFromNowPlaying(
  session: CollectiblesNowPlayingSession
): CollectionView {
  const firstTrack = session.tracks[0];
  const artistId = firstTrack?.artist?.trim() || '';
  return collectionViewPlaceholder({
    collectionId: session.collectionId,
    creatorId: artistId,
    title: session.title,
    mediaUrl: session.poster,
    kind: 'audio',
    audioFormat: session.tracks.length > 1 ? 'album' : 'single',
    playables: session.tracks,
  });
}

/**
 * Peek / now-playing placeholders paint cover + title on frame 1 with
 * `createdAtMs === 0`. SSR catalog shells always carry a real createdAt —
 * only those may skip the first keyed soft-fill.
 */
export function collectionViewNeedsCatalogSoftFill(
  view: CollectionView | null | undefined
): boolean {
  if (!view) return true;
  return view.createdAtMs <= 0;
}

/**
 * Visible drop title for the face. Empty when missing or equal to the
 * collection id — never paint the id as a title (omit / shimmer instead).
 */
export function collectionFaceTitle(
  title: string | null | undefined,
  collectionId: string
): string {
  const trimmed = title?.trim() || '';
  const id = collectionId.trim();
  if (!trimmed || !id) return trimmed;
  if (trimmed === id) return '';
  return trimmed;
}

/**
 * List→place soft-fill seed (createdAtMs === 0). Face fields come from the
 * seed like Drops' row view; catalog still soft-fills quietly afterward.
 */
export function collectionSoftFillPeek(
  initial: CollectionView | null | undefined
): boolean {
  return initial != null && collectionViewNeedsCatalogSoftFill(initial);
}

/**
 * Soft-fill peek still waiting on catalog for the medium body.
 * Hold the tracks skeleton in place — never mount the seat only when
 * playables arrive (face-first then tracks = early partial paint).
 */
export function collectionMediumBodyPending(opts: {
  softFillPeek: boolean;
  isAudio: boolean;
  hasPlayables: boolean;
}): boolean {
  return opts.softFillPeek && opts.isAudio && !opts.hasPlayables;
}

/**
 * Soft-fill a peek seed with catalog without swapping frame-1 face chrome.
 * Keeps a real seed title (and jacket) stable so soft-fill does not jump
 * the hero; commerce / about sheet fields take the catalog values.
 */
export function mergeCatalogSoftFillIntoSeed(
  seed: CollectionView,
  catalog: CollectionView
): CollectionView {
  const seedTitle = collectionFaceTitle(seed.title, seed.collectionId);
  const catalogTitle = collectionFaceTitle(catalog.title, catalog.collectionId);
  const seedKind = seed.kind?.trim() || null;
  return {
    ...catalog,
    title: seedTitle || catalogTitle,
    mediaUrl: catalog.mediaUrl?.trim() || seed.mediaUrl,
    cardBg: catalog.cardBg || seed.cardBg,
    // Keep medium identity from the seed so party lead / Read do not swap.
    kind: seedKind || catalog.kind,
    audioFormat: seed.audioFormat ?? catalog.audioFormat,
    writingFormat: seed.writingFormat ?? catalog.writingFormat,
  };
}

/**
 * List / cover-peek seed — title + cover on frame 1; kind and commerce
 * soft-fill from the indexer after open. Prefer a full `CollectionView`
 * when the list already has one.
 */
export function seedCollectionViewFromPeek(input: {
  collectionId: string;
  title?: string | null;
  coverUrl?: string | null;
  appId?: string | null;
  creatorId?: string | null;
  kind?: string | null;
  audioFormat?: CollectionView['audioFormat'];
  /** List blurb when the row already has it — about teaser paints frame 1. */
  description?: string | null;
}): CollectionView | null {
  const collectionId = input.collectionId.trim();
  if (!collectionId) return null;
  // Never paint the collection id as the title — that flashes then jumps when
  // catalog soft-fill lands. Empty title soft-fills; callers pass a real name.
  const title = input.title?.trim() || '';
  return collectionViewPlaceholder({
    collectionId,
    title,
    mediaUrl: input.coverUrl?.trim() || null,
    appId: input.appId,
    creatorId: input.creatorId ?? undefined,
    kind: input.kind ?? null,
    audioFormat: input.audioFormat ?? null,
    description: input.description,
  });
}

type StoreDropSeed = {
  collectionId: string;
  title: string;
  mediaUrl?: string | null;
  priceNear?: string | null;
  usdE6?: string | null;
  remaining: number;
  totalSupply: number;
  status: 'upcoming' | 'live' | 'sold_out' | 'ended' | 'paused' | 'cancelled';
  mediumKind?: string | null;
  audioFormat?: CollectionView['audioFormat'];
  writingFormat?: CollectionView['writingFormat'];
  createdAtMs?: number | null;
};

/**
 * Feed scarce CTA → thin place seed (jacket + deal). Remembered full views
 * are applied at open via resolveDropOpenSeed — never read during render.
 */
export function seedCollectionViewFromPostScarceEmbed(
  embed: {
    collectionId?: string | null;
    mediaUrl?: string | null;
    mediumKind?: string | null;
    creatorId?: string | null;
    appId?: string | null;
    priceNear?: string | null;
    usdE6?: string | null;
    copies?: number | null;
    remaining?: number | null;
    status?: string | null;
    latest?: { collectionId?: string | null; appId?: string | null } | null;
  },
  opts?: { title?: string | null }
): CollectionView | null {
  const collectionId =
    embed.collectionId?.trim() || embed.latest?.collectionId?.trim() || '';
  if (!collectionId) return null;
  const totalSupply =
    embed.copies != null && embed.copies > 0 ? embed.copies : 0;
  const remaining =
    embed.remaining != null && embed.remaining >= 0
      ? embed.remaining
      : totalSupply;
  const soldOut =
    embed.status === 'sold' ||
    embed.status === 'minted' ||
    (totalSupply > 0 && remaining === 0);
  return seedCollectionViewFromStoreDrop(
    {
      collectionId,
      title: opts?.title?.trim() || '',
      mediaUrl: embed.mediaUrl,
      priceNear: embed.priceNear,
      usdE6: embed.usdE6,
      remaining,
      totalSupply,
      status: soldOut ? 'sold_out' : 'live',
      mediumKind: embed.mediumKind,
    },
    embed.creatorId
  );
}

/**
 * Creator shop / portfolio store row → place seed.
 * Paints jacket + deal status/supply/price on frame 1 so soft-fill does not
 * pop those fields after open. `createdAtMs` stays 0 so catalog still soft-fills.
 */
export function seedCollectionViewFromStoreDrop(
  drop: StoreDropSeed,
  creatorId?: string | null
): CollectionView | null {
  const base = seedCollectionViewFromPeek({
    collectionId: drop.collectionId,
    title: drop.title,
    coverUrl: drop.mediaUrl,
    creatorId: creatorId ?? null,
    kind: drop.mediumKind ?? null,
    audioFormat: drop.audioFormat ?? null,
  });
  if (!base) return null;

  const totalSupply = drop.totalSupply > 0 ? drop.totalSupply : 0;
  const remaining = Math.max(0, drop.remaining);
  const minted = totalSupply > 0 ? Math.max(0, totalSupply - remaining) : 0;
  const now = Date.now();
  const priceNear = drop.priceNear?.trim() || null;
  const priced = Boolean(priceNear && priceNear !== '0');

  return {
    ...base,
    priceNear,
    priceYocto: priced ? '1' : '0',
    ...(drop.usdE6?.trim() ? { usdE6: drop.usdE6.trim() } : {}),
    totalSupply,
    remaining,
    minted,
    soldOut: drop.status === 'sold_out' || (totalSupply > 0 && remaining === 0),
    paused: drop.status === 'paused',
    cancelled: drop.status === 'cancelled',
    startTimeMs: drop.status === 'upcoming' ? now + 60_000 : null,
    endTimeMs: drop.status === 'ended' ? now - 60_000 : null,
    writingFormat: drop.writingFormat ?? null,
    // Keep soft-fill on for event/about; list already owned the deal line.
    createdAtMs: 0,
  };
}
