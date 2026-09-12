import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { APP_DROPS_PATH, collectionPath } from '@/lib/app-routes';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';
import type { CollectiblesNowPlayingSession } from '@/contexts/collectibles-now-playing-context';
import type { CollectionView } from '@/features/scarces/collections-data';

/** Art matches create-drop / wallets: inset 1×1. Audio is also square. */
export function collectionCoverSquare(opts: {
  kind?: string | null;
  isAudio: boolean;
}): boolean {
  if (opts.isAudio) return true;
  return (opts.kind ?? '').trim().toLowerCase() === 'art';
}

/** Art stays an inset square — no 16/10 immersive bleed. */
export function collectionCoverImmersive(opts: {
  hasMedia: boolean;
  kind?: string | null;
}): boolean {
  if (!opts.hasMedia) return false;
  return (opts.kind ?? '').trim().toLowerCase() !== 'art';
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

/** Mint meter / NEAR / supply — visitors, or holders who can still mint. */
export function collectionShowCommerceMeter(opts: {
  useFirst: boolean;
  canMintMore: boolean;
}): boolean {
  return !opts.useFirst || opts.canMintMore;
}

/** Visitors only — holders listen on /collectibles/play. */
export function collectionShowInlineTracks(opts: {
  hasPlayables: boolean;
  ownership: CollectionOwnership;
}): boolean {
  return opts.hasPlayables && opts.ownership === 'visitor';
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

/** Same key as app-wallet-context — seed hold before React wallet hydrates. */
const APP_WALLET_ACCOUNT_KEY = 'onsocial.app.wallet.accountId';

function peekStoredWalletAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(APP_WALLET_ACCOUNT_KEY);
  } catch {
    return null;
  }
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
  const owner = accountId?.trim();
  const id = collectionId.trim();
  if (!owner || !id) return null;
  const page = peekOwnedVaultPage(owner);
  if (!page) return null;
  return (
    page.items.find((item) => itemCollectionId(item) === id)?.tokenId ?? null
  );
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
  return {
    collectionId: session.collectionId,
    creatorId: artistId,
    title: session.title,
    mediaUrl: session.poster,
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
    appId: null,
    appCommissionBps: null,
    kind: 'audio',
    audioFormat: session.tracks.length > 1 ? 'album' : 'single',
    facets: [],
    playables: session.tracks,
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
    place: null,
    accessEndsAtMs: null,
    royalty: null,
  };
}

