import { cache } from 'react';
import type { ScarcesActiveListingRow } from '@onsocial/sdk';
import {
  deriveCollectionStatus,
  fetchCollectionsByCreator,
} from '@/features/scarces/collections-data';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { filterBuyableStoreDrops } from '@/lib/profile-store-available';
import { collectionToProfileStoreDrop } from '@/lib/profile-store-map';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  EMPTY_PROFILE_STORE,
  type ProfileStoreListing,
  type ProfileStoreShelf,
} from '@/lib/profile-store-types';

/**
 * Creator Store shelf — buyable drops (live / soon) plus active listings seed.
 * Sold-out catalog history lives in the Drops tab; recent sales are omitted.
 */

/** SSR seed size — the Store tab client-fetches the full list after mount. */
export const PROFILE_STORE_LISTING_PEEK = 6;
/** Drop (collection) cards on the shelf — buyable live / soon only in Store. */
export const PROFILE_STORE_DROP_PEEK = 24;

export { EMPTY_PROFILE_STORE };
export type { ProfileStoreListing, ProfileStoreShelf };

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

  const creator = row.creatorId?.trim().toLowerCase();
  const seller = row.sellerId?.trim().toLowerCase();
  const resale = Boolean(creator && seller && creator !== seller);
  const tokenId = row.tokenId?.trim() || null;
  const collectionId = tokenId ? collectionIdFromTokenId(tokenId) : null;

  return {
    key: row.listingKey,
    kind,
    title: displayTitle(row.title, row.tokenId),
    priceNear: yoctoToNearDisplay(displayYocto),
    priceLabel,
    mediaUrl: resolveMedia(row.media),
    ...(resale ? { resale: true } : {}),
    ...(collectionId ? { collectionId } : {}),
    ...(tokenId ? { tokenId } : {}),
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

export const fetchProfileStoreShelf = cache(
  async (accountId: string): Promise<ProfileStoreShelf> => {
    const seller = accountId.trim();
    if (!seller) return EMPTY_PROFILE_STORE;
    try {
      const os = createServerOnSocialClient();
      const [rows, collections] = await Promise.all([
        os.query.scarces.activeListings({
          sellerId: seller,
          limit: PROFILE_STORE_LISTING_PEEK + 1,
        }),
        fetchCollectionsByCreator(seller, {
          limit: PROFILE_STORE_DROP_PEEK,
        }).catch(() => []),
      ]);

      const listings = rows
        .map(listingFromRow)
        .filter((item): item is ProfileStoreListing => item != null);
      const previewed = listings.slice(0, PROFILE_STORE_LISTING_PEEK);

      const drops = filterBuyableStoreDrops(
        collections
          .filter(
            (collection) => deriveCollectionStatus(collection) !== 'cancelled'
          )
          .slice(0, PROFILE_STORE_DROP_PEEK)
          .map(collectionToProfileStoreDrop)
      );

      return {
        listings: previewed,
        drops,
        sales: [],
        listingCount: previewed.length,
        hasMore: listings.length > previewed.length,
      };
    } catch {
      return EMPTY_PROFILE_STORE;
    }
  }
);
