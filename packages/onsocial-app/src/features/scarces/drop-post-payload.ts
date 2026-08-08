import type { ComposerDropDraft } from '@/features/guilds/guild-composer-sheet';
import {
  postKindFromDropMedium,
  scarcesContractIdForNetwork,
} from '@/features/scarces/drop-compose-draft';

/** Durable collection embed for posts.create / groups.post. */
export function collectionEmbedFromDraft(drop: ComposerDropDraft) {
  return {
    kind: 'collection' as const,
    chain: 'near',
    contract: scarcesContractIdForNetwork(),
    collectionId: drop.collectionId.trim(),
    ...(drop.tokenId?.trim() ? { tokenId: drop.tokenId.trim() } : {}),
  };
}

/** Optional first-paint snapshot under `x.onsocial.drop`. */
export function dropSnapshotExtra(drop: ComposerDropDraft) {
  return {
    onsocial: {
      drop: {
        collectionId: drop.collectionId.trim(),
        ...(drop.tokenId?.trim() ? { tokenId: drop.tokenId.trim() } : {}),
        title: drop.title.trim() || drop.collectionId.trim(),
        ...(drop.mediaUrl?.trim() ? { mediaUrl: drop.mediaUrl.trim() } : {}),
        ...(drop.mediumKind?.trim()
          ? { mediumKind: drop.mediumKind.trim().toLowerCase() }
          : {}),
      },
    },
  };
}

/** Caption written on-chain and into optimistic JSON (never blank for Drop-only). */
export function resolvedDropPostText(
  text: string,
  drop: ComposerDropDraft | null | undefined
): string {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (!drop?.collectionId?.trim()) return '';
  return drop.title.trim() || 'Drop';
}

export function dropPostKind(drop: ComposerDropDraft | null | undefined) {
  if (!drop?.collectionId?.trim()) return undefined;
  return postKindFromDropMedium(drop.mediumKind);
}
