import { cache } from 'react';
import type { ScarcesActiveListingRow, ScarcesEventRow } from '@onsocial/sdk';
import {
  deriveCollectionStatus,
  fetchCollectionsByCreator,
} from '@/features/scarces/collections-data';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreDrop,
  type ProfileStoreListing,
  type ProfileStoreSale,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';

/**
 * Creator Store shelf (Phase 1) — an account's live listings plus recent
 * sales, indexer-first via `os.query.scarces.activeListings({ sellerId })`
 * and `recentSales({ sellerId })`. Read-only for the portfolio drawer; buy /
 * bid still happen in Market (deep-linked by creator).
 */

/** How many live listings to preview on the shelf before "Shop all". */
export const PROFILE_STORE_LISTING_PEEK = 6;
/** How many recent sales to show under the shelf. */
export const PROFILE_STORE_SALE_PEEK = 4;
/** How many drops (collections) to show on the shelf. */
export const PROFILE_STORE_DROP_PEEK = 6;

export { EMPTY_PROFILE_STORE };
export type { ProfileStoreListing, ProfileStoreSale, ProfileStoreShelf };

const NEAR_DECIMALS = 24;

function yoctoToNearDisplay(raw: string | null | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
  const near = frac ? `${whole}.${frac}` : whole;
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function resolveMedia(media: string | null | undefined): string | null {
  const trimmed = media?.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('ipfs://')) return resolveProfileMediaUrl(trimmed);
  return resolveProfileMediaUrl(`ipfs://${trimmed}`);
}

function hasUnresolvedTitleTemplate(title: string): boolean {
  return /#\{[^}]+\}|\{[a-z_]+\}/i.test(title);
}

function displayTitle(
  title: string | null | undefined,
  tokenId: string | null | undefined
): string {
  const id = tokenId?.trim() ?? '';
  const raw =
    title?.trim() ||
    (id.includes(':') && !id.startsWith('s:') ? id : 'Scarce');
  if (!hasUnresolvedTitleTemplate(raw)) return raw;
  const edition = id.includes(':') ? id.split(':').at(-1) : id;
  return raw.replace(/#\{id\}/gi, `#${edition}`).replace(/\{token_id\}/gi, id);
}

function listingFromRow(
  row: ScarcesActiveListingRow
): ProfileStoreListing | null {
  const kind =
    row.kind === 'lazy' || row.kind === 'native' || row.kind === 'auction'
      ? row.kind
      : null;
  if (!kind) return null;

  const remaining =
    row.remaining != null && Number.isFinite(row.remaining)
      ? Math.max(0, Math.floor(row.remaining))
      : undefined;
  if (kind === 'lazy' && remaining === 0) return null;

  const hasBid =
    Boolean(row.highestBid) &&
    /^\d+$/.test(row.highestBid ?? '') &&
    BigInt(row.highestBid ?? '0') > 0n;
  const displayYocto =
    kind === 'auction'
      ? hasBid
        ? row.highestBid
        : (row.reservePrice ?? row.price)
      : row.price;
  const priceLabel: ProfileStoreListing['priceLabel'] =
    kind === 'auction'
      ? hasBid
        ? 'High bid'
        : 'Reserve'
      : kind === 'lazy'
        ? 'From'
        : 'Ask';

  return {
    key: row.listingKey,
    kind,
    title: displayTitle(row.title, row.tokenId),
    priceNear: yoctoToNearDisplay(displayYocto),
    priceLabel,
    mediaUrl: resolveMedia(row.media),
    ...(row.tokenId?.trim() ? { tokenId: row.tokenId.trim() } : {}),
    ...(kind === 'lazy' && row.listingId?.trim()
      ? { listingId: row.listingId.trim() }
      : {}),
    ...(row.sourcePostPath?.trim()
      ? { sourcePostPath: row.sourcePostPath.trim() }
      : {}),
    ...(remaining != null ? { remaining } : {}),
    ...(kind === 'auction'
      ? {
          bidCount: row.bidCount ?? 0,
          expiresAtNs:
            row.expiresAt != null && row.expiresAt > 0 ? row.expiresAt : null,
        }
      : {}),
  };
}

function saleTitleFromRow(row: ScarcesEventRow): string {
  if (row.extraData) {
    try {
      const extra = JSON.parse(row.extraData) as Record<string, unknown>;
      for (const key of ['title', 'name', 'tokenTitle']) {
        const value = extra[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    } catch {
      // fall through
    }
  }
  return displayTitle(null, row.tokenId);
}

function saleMediaFromRow(row: ScarcesEventRow): string | null {
  if (!row.extraData) return null;
  try {
    const extra = JSON.parse(row.extraData) as Record<string, unknown>;
    for (const key of ['media', 'mediaUrl', 'mediaCid']) {
      const value = extra[key];
      if (typeof value === 'string' && value.trim()) {
        return resolveMedia(value.trim());
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export const fetchProfileStoreShelf = cache(
  async (accountId: string): Promise<ProfileStoreShelf> => {
    const seller = accountId.trim();
    if (!seller) return EMPTY_PROFILE_STORE;
    try {
      const os = createServerOnSocialClient();
      const [rows, sales, collections] = await Promise.all([
        os.query.scarces.activeListings({
          sellerId: seller,
          limit: PROFILE_STORE_LISTING_PEEK + 1,
        }),
        os.query.scarces
          .recentSales({ sellerId: seller, limit: PROFILE_STORE_SALE_PEEK })
          .catch(() => [] as ScarcesEventRow[]),
        fetchCollectionsByCreator(seller, {
          limit: PROFILE_STORE_DROP_PEEK,
        }).catch(() => []),
      ]);

      const listings = rows
        .map(listingFromRow)
        .filter((item): item is ProfileStoreListing => item != null);
      const previewed = listings.slice(0, PROFILE_STORE_LISTING_PEEK);

      const drops: ProfileStoreDrop[] = collections
        .filter((collection) => deriveCollectionStatus(collection) !== 'cancelled')
        .slice(0, PROFILE_STORE_DROP_PEEK)
        .map((collection) => ({
          key: collection.collectionId,
          collectionId: collection.collectionId,
          title: collection.title,
          mediaUrl: collection.mediaUrl,
          priceNear: collection.priceNear,
          remaining: collection.remaining,
          totalSupply: collection.totalSupply,
          status: deriveCollectionStatus(collection),
        }));

      const saleItems: ProfileStoreSale[] = sales
        .slice(0, PROFILE_STORE_SALE_PEEK)
        .map((row, index) => ({
          key: `${row.tokenId ?? row.listingId ?? 'sale'}:${row.blockTimestamp}:${index}`,
          title: saleTitleFromRow(row),
          priceNear: yoctoToNearDisplay(row.price ?? row.amount),
          buyerId: row.buyerId?.trim() || null,
          blockTimestamp: Number(row.blockTimestamp) || 0,
          mediaUrl: saleMediaFromRow(row),
        }));

      return {
        listings: previewed,
        drops,
        sales: saleItems,
        listingCount: previewed.length,
        hasMore: listings.length > previewed.length,
      };
    } catch {
      return EMPTY_PROFILE_STORE;
    }
  }
);
