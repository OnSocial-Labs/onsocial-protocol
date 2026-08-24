import type { DropDiscoveryItem } from '@/features/drops/drops-data';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

/** Map profile shelf / catalog rows → discovery menu shape. */
export function profileStoreDropToDiscoveryItem(
  drop: ProfileStoreDrop,
  creatorId: string,
  creator?: {
    displayName?: string | null;
    avatarUrl?: string | null;
  }
): DropDiscoveryItem {
  const mintedCount =
    drop.totalSupply > 0
      ? Math.max(0, drop.totalSupply - drop.remaining)
      : 0;

  return {
    collectionId: drop.collectionId,
    creatorId: creatorId.trim(),
    title: drop.title,
    mediaUrl: drop.mediaUrl,
    priceNear: drop.priceNear,
    mintedCount,
    remaining: drop.remaining,
    totalSupply: drop.totalSupply,
    startTimeMs: null,
    endTimeMs: null,
    status: drop.status,
    hasAllowlist: false,
    mediumKind: drop.mediumKind ?? null,
    hasPlayable: drop.hasPlayable ?? false,
    trackCount: null,
    description: null,
    createdAtMs: drop.createdAtMs ?? null,
    creatorAvatarUrl: creator?.avatarUrl ?? null,
    creatorDisplayName: creator?.displayName ?? null,
    ...(drop.fanCount != null ? { fanCount: drop.fanCount } : {}),
    ...(drop.fanIds?.length ? { fanIds: drop.fanIds } : {}),
    view: null,
  };
}
