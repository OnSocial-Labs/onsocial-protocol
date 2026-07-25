import type { NearWalletBase } from '@hot-labs/near-connect';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  auctionExpiresAtMs,
  fetchScarceTokenMeta,
  formatMarketRelativeTime,
  resolveScarceMediaUrl,
  resolveTokenDisplayTitle,
} from '@/features/market/market-listings';
import { fetchScarceAuctionView } from '@/features/scarces/scarce-auction';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

/** Listing actions the viewer can take now (settle / cancel / delist). */
export type ListingActionKind =
  | 'collect_win'
  | 'complete_sale'
  | 'cancel_auction'
  | 'delist'
  | 'cancel_lazy';

export interface ListingActionItem {
  id: string;
  kind: ListingActionKind;
  title: string;
  mediaUrl?: string | null;
  /** Native token id when present. */
  tokenId?: string;
  /** Lazy listing id when present. */
  listingId?: string;
  sellerId: string;
  priceNear: string | null;
  bidCount: number;
  expiresAtNs: number | null;
  /** Listed time (ms) from indexer `listedBlockTimestamp`. */
  listedAtMs?: number | null;
  ended: boolean;
  reserveMet?: boolean;
  sourcePostPath?: string;
}

export interface ListingActionsPage {
  items: ListingActionItem[];
}

function listedAtMsFromRow(
  listedBlockTimestamp: number | null | undefined
): number | null {
  if (
    listedBlockTimestamp == null ||
    !Number.isFinite(listedBlockTimestamp) ||
    listedBlockTimestamp <= 0
  ) {
    return null;
  }
  return listedBlockTimestamp > 1e15
    ? Math.floor(listedBlockTimestamp / 1e6)
    : listedBlockTimestamp > 1e12
      ? listedBlockTimestamp
      : listedBlockTimestamp * 1000;
}

/** Compact age only (`1d ago`) — section / row kind carries Ended vs Listed. */
export function listingActionAgeLabel(item: ListingActionItem): string {
  if (item.kind === 'collect_win' || item.kind === 'complete_sale') {
    const endsAtMs = auctionExpiresAtMs(item.expiresAtNs);
    if (endsAtMs == null) return '';
    return formatMarketRelativeTime(endsAtMs) || '';
  }
  if (item.listedAtMs != null && item.listedAtMs > 0) {
    return formatMarketRelativeTime(item.listedAtMs) || '';
  }
  return '';
}

/** @deprecated Prefer {@link listingActionAgeLabel}. */
export function listingActionTimeLabel(item: ListingActionItem): string {
  const age = listingActionAgeLabel(item);
  if (!age) {
    if (item.kind === 'collect_win' || item.kind === 'complete_sale') {
      return 'Ended';
    }
    return '';
  }
  if (item.kind === 'collect_win' || item.kind === 'complete_sale') {
    return `Ended ${age}`;
  }
  return `Listed ${age}`;
}

/** Section headers — always shown so auction vs listing stays obvious. */
export function listingActionSectionTitle(kind: ListingActionKind): string {
  switch (kind) {
    case 'collect_win':
      return 'Won auctions';
    case 'complete_sale':
      return 'Sales to complete';
    case 'cancel_auction':
    case 'delist':
    case 'cancel_lazy':
      return 'Your listings';
  }
}

/**
 * Short row facts — no account ids, no age (age sits above the CTA).
 * Example: `3 bids · 0.5 NEAR` or `Auction · 0.5 NEAR`.
 */
export function listingActionRowMeta(item: ListingActionItem): string {
  const bits: string[] = [];
  if (item.kind === 'cancel_auction') bits.push('Auction');
  else if (item.kind === 'delist') bits.push('Fixed');
  else if (item.kind === 'cancel_lazy') bits.push('Edition');

  if (
    (item.kind === 'collect_win' || item.kind === 'complete_sale') &&
    item.bidCount > 0
  ) {
    bits.push(item.bidCount === 1 ? '1 bid' : `${item.bidCount} bids`);
  }
  if (item.priceNear) {
    bits.push(`${item.priceNear} NEAR`);
  }
  if (item.kind === 'collect_win' && item.reserveMet === false) {
    bits.push('reserve unmet');
  }
  return bits.join(' · ');
}

/** True when the Market auction detail sheet can open for this row. */
export function listingActionOpensBidSheet(kind: ListingActionKind): boolean {
  return kind === 'collect_win' || kind === 'complete_sale';
}

function listingEnded(expiresAtNs: number | null, nowMs: number): boolean {
  const endsAtMs = auctionExpiresAtMs(expiresAtNs);
  return endsAtMs != null && endsAtMs <= nowMs;
}

function priceNearFromYocto(raw: string | null | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const near = yoctoToNear(raw);
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function displayTitle(
  title: string | null | undefined,
  tokenId: string | null | undefined
): string {
  const raw =
    title?.trim() ||
    (tokenId && tokenId.includes(':') && !tokenId.startsWith('s:')
      ? tokenId
      : 'Scarce');
  return resolveTokenDisplayTitle(raw, tokenId?.trim() || '');
}

/**
 * Listings the viewer can settle, cancel, or delist — portfolio claim drawer
 * and action-needed pill. Seller path is indexer-first; buyer settle verifies
 * highest-bidder via RPC and hydrates title/media from the token.
 */
export async function fetchListingActions(
  accountId: string,
  opts: { nowMs?: number } = {}
): Promise<ListingActionsPage> {
  const viewer = accountId.trim();
  if (!viewer) return { items: [] };
  const nowMs = opts.nowMs ?? Date.now();
  const client = createReadOnlyOnSocialClient();

  const [sellerRows, bidEvents] = await Promise.all([
    client.query.scarces
      .activeListings({ sellerId: viewer, limit: 80 })
      .catch(() => []),
    client.query.scarces
      .events({
        eventType: 'SCARCE_UPDATE',
        operation: 'auction_bid',
        author: viewer,
        limit: 60,
      })
      .catch(() => []),
  ]);

  const byId = new Map<string, ListingActionItem>();

  for (const row of sellerRows) {
    const sellerId = row.sellerId?.trim() || viewer;
    const tokenId = row.tokenId?.trim() || undefined;
    const listingId = row.listingId?.trim() || undefined;
    const title = displayTitle(row.title, tokenId);
    const mediaUrl = resolveScarceMediaUrl(row.media);
    const bidCount =
      row.bidCount != null && Number.isFinite(row.bidCount)
        ? Math.max(0, Math.floor(row.bidCount))
        : 0;
    const expiresAtNs =
      row.expiresAt != null && row.expiresAt > 0 ? row.expiresAt : null;
    const ended = listingEnded(expiresAtNs, nowMs);
    const priceNear = priceNearFromYocto(row.price ?? row.highestBid);
    const listedAtMs = listedAtMsFromRow(row.listedBlockTimestamp);
    const sourcePostPath = row.sourcePostPath?.trim() || undefined;

    if (row.kind === 'auction' && tokenId) {
      if (bidCount > 0 && ended) {
        const id = `complete_sale:${tokenId}`;
        byId.set(id, {
          id,
          kind: 'complete_sale',
          title,
          mediaUrl,
          tokenId,
          sellerId,
          priceNear,
          bidCount,
          expiresAtNs,
          listedAtMs,
          ended: true,
          ...(sourcePostPath ? { sourcePostPath } : {}),
        });
      } else if (bidCount === 0) {
        const id = `cancel_auction:${tokenId}`;
        byId.set(id, {
          id,
          kind: 'cancel_auction',
          title,
          mediaUrl,
          tokenId,
          sellerId,
          priceNear,
          bidCount: 0,
          expiresAtNs,
          listedAtMs,
          ended,
          ...(sourcePostPath ? { sourcePostPath } : {}),
        });
      }
      continue;
    }

    if (row.kind === 'native' && tokenId) {
      const id = `delist:${tokenId}`;
      byId.set(id, {
        id,
        kind: 'delist',
        title,
        mediaUrl,
        tokenId,
        sellerId,
        priceNear,
        bidCount: 0,
        expiresAtNs,
        listedAtMs,
        ended: false,
        ...(sourcePostPath ? { sourcePostPath } : {}),
      });
      continue;
    }

    if (row.kind === 'lazy' && listingId) {
      const remaining =
        row.remaining != null && Number.isFinite(row.remaining)
          ? Math.max(0, Math.floor(row.remaining))
          : null;
      if (remaining === 0) continue;
      const id = `cancel_lazy:${listingId}`;
      byId.set(id, {
        id,
        kind: 'cancel_lazy',
        title,
        mediaUrl,
        listingId,
        sellerId,
        priceNear,
        bidCount: 0,
        expiresAtNs,
        listedAtMs,
        ended: false,
        ...(sourcePostPath ? { sourcePostPath } : {}),
      });
    }
  }

  // Buyer collect — unique tokens we bid on, still live, clock ended, we won.
  const candidateTokenIds: string[] = [];
  const seenTokens = new Set<string>();
  for (const event of bidEvents) {
    const tokenId = event.tokenId?.trim();
    if (!tokenId || seenTokens.has(tokenId)) continue;
    seenTokens.add(tokenId);
    candidateTokenIds.push(tokenId);
    if (candidateTokenIds.length >= 24) break;
  }

  if (candidateTokenIds.length > 0) {
    const views = await Promise.all(
      candidateTokenIds.map((tokenId) => fetchScarceAuctionView(tokenId))
    );
    const wins: ListingActionItem[] = [];
    for (let i = 0; i < candidateTokenIds.length; i += 1) {
      const tokenId = candidateTokenIds[i]!;
      const view = views[i];
      if (!view?.isEnded || !view.highestBidder) continue;
      if (!accountIdsEqual(view.highestBidder, viewer)) continue;
      // Seller complete_sale already covers own auctions.
      if (accountIdsEqual(view.sellerId, viewer)) continue;
      const id = `collect_win:${tokenId}`;
      if (byId.has(id) || byId.has(`complete_sale:${tokenId}`)) continue;
      const item: ListingActionItem = {
        id,
        kind: 'collect_win',
        title: displayTitle(null, tokenId),
        tokenId,
        sellerId: view.sellerId,
        priceNear: priceNearFromYocto(view.highestBidYocto),
        bidCount: view.bidCount,
        expiresAtNs: view.expiresAtNs,
        ended: true,
        reserveMet: view.reserveMet,
      };
      byId.set(id, item);
      wins.push(item);
    }

    // Token RPC hydrate — catalog alone often leaves title as "Scarce".
    await Promise.all(
      wins.map(async (item) => {
        if (!item.tokenId) return;
        const meta = await fetchScarceTokenMeta(item.tokenId);
        if (!meta) return;
        if (meta.title) {
          item.title = resolveTokenDisplayTitle(meta.title, item.tokenId);
        }
        if (meta.mediaUrl) item.mediaUrl = meta.mediaUrl;
        if (meta.sourcePostPath) item.sourcePostPath = meta.sourcePostPath;
      })
    );
  }

  const priority: Record<ListingActionKind, number> = {
    collect_win: 0,
    complete_sale: 1,
    cancel_auction: 2,
    delist: 3,
    cancel_lazy: 4,
  };

  const items = [...byId.values()].sort(
    (a, b) =>
      priority[a.kind] - priority[b.kind] ||
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  );

  return { items };
}

/** Short primary CTA — section / header carry the rest of the meaning. */
export function listingActionPrimaryLabel(kind: ListingActionKind): string {
  switch (kind) {
    case 'collect_win':
      return 'Collect';
    case 'complete_sale':
      return 'Complete';
    case 'cancel_auction':
      return 'Cancel';
    case 'delist':
      return 'Delist';
    case 'cancel_lazy':
      return 'Cancel';
  }
}

export function listingActionPendingLabel(kind: ListingActionKind): string {
  switch (kind) {
    case 'collect_win':
    case 'complete_sale':
      return 'Confirming…';
    case 'cancel_auction':
    case 'cancel_lazy':
      return 'Canceling…';
    case 'delist':
      return 'Delisting…';
  }
}

/** Quiet status word — prefer section titles in the drawer. */
export function listingActionEyebrow(kind: ListingActionKind): string {
  switch (kind) {
    case 'collect_win':
      return 'You won';
    case 'complete_sale':
      return 'Sale ended';
    case 'cancel_auction':
      return 'Auction';
    case 'delist':
      return 'Fixed';
    case 'cancel_lazy':
      return 'Edition';
  }
}

type TrackTransaction = (args: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
}) => Promise<boolean>;

/** Run settle / cancel / delist for one action item. */
export async function executeListingAction(opts: {
  item: ListingActionItem;
  accountId: string;
  wallet: NearWalletBase;
  trackTransaction: TrackTransaction;
}): Promise<boolean> {
  const { item, accountId, wallet, trackTransaction } = opts;
  const client = createAppScarcesWalletClient(accountId, wallet);

  let response: unknown;
  let submittedMessage: string;
  let successMessage: string;
  let failureMessage: string;

  switch (item.kind) {
    case 'collect_win':
    case 'complete_sale': {
      if (!item.tokenId) return false;
      response = await client.scarces.auctions.settle(item.tokenId);
      submittedMessage = txToastConfirming.settlingScarceAuction;
      successMessage =
        item.kind === 'collect_win'
          ? txToastSuccess.scarceAuctionCollected
          : txToastSuccess.scarceAuctionSettled;
      failureMessage = txToastError.settleScarceAuctionFailed;
      break;
    }
    case 'cancel_auction': {
      if (!item.tokenId) return false;
      response = await client.scarces.auctions.cancel(item.tokenId);
      submittedMessage = txToastConfirming.cancelingScarceListing;
      successMessage = txToastSuccess.scarceListingCanceled;
      failureMessage = txToastError.cancelScarceListingFailed;
      break;
    }
    case 'delist': {
      if (!item.tokenId) return false;
      response = await client.scarces.market.delist(item.tokenId);
      submittedMessage = txToastConfirming.cancelingScarceListing;
      successMessage = txToastSuccess.scarceListingCanceled;
      failureMessage = txToastError.cancelScarceListingFailed;
      break;
    }
    case 'cancel_lazy': {
      if (!item.listingId) return false;
      response = await client.scarces.lazy.cancel(item.listingId);
      submittedMessage = txToastConfirming.cancelingScarceListing;
      successMessage = txToastSuccess.scarceListingCanceled;
      failureMessage = txToastError.cancelScarceListingFailed;
      break;
    }
  }

  return trackTransaction({
    txHashes: collectRelayTxHashes(response),
    submittedMessage,
    successMessage,
    failureMessage,
  });
}
