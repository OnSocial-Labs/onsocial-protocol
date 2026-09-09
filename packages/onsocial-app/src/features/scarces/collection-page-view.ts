import { peekOwnedVaultPage } from '@/features/market/owned-vault-cache';
import { APP_DROPS_PATH, collectionPath } from '@/lib/app-routes';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { portfolioCollectiblesPath } from '@/lib/overlay-routes';

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

/** Holder or creator — Play / Read / Show pass first, commerce second. */
export function collectionUseFirst(opts: {
  isOwner: boolean;
  holdsEdition: boolean | null;
}): boolean {
  return opts.isOwner || opts.holdsEdition === true;
}

/** Mint meter / NEAR / supply — visitors, or holders who can still mint. */
export function collectionShowCommerceMeter(opts: {
  useFirst: boolean;
  canMintMore: boolean;
}): boolean {
  return !opts.useFirst || opts.canMintMore;
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
