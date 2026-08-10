import type { ComposerDropDraft } from '@/features/guilds/guild-composer-sheet';
import {
  isDropComposeDraftReady,
  postKindFromDropMedium,
  scarcesContractIdForNetwork,
} from '@/features/scarces/drop-compose-draft';

/** Durable collection embed for posts.create / groups.post. */
export function collectionEmbedFromDraft(drop: ComposerDropDraft) {
  const collectionId = drop.collectionId?.trim();
  if (!collectionId) {
    throw new Error('collectionEmbedFromDraft requires collectionId');
  }
  return {
    kind: 'collection' as const,
    chain: 'near',
    contract: scarcesContractIdForNetwork(),
    collectionId,
    ...(drop.tokenId?.trim() ? { tokenId: drop.tokenId.trim() } : {}),
  };
}

/** Durable token embed for post-minted / non-collection resale announces. */
export function tokenEmbedFromDraft(drop: ComposerDropDraft) {
  const tokenId = drop.tokenId?.trim();
  if (!tokenId) {
    throw new Error('tokenEmbedFromDraft requires tokenId');
  }
  return {
    kind: 'token' as const,
    chain: 'near',
    contract: scarcesContractIdForNetwork(),
    tokenId,
  };
}

/**
 * Prefer collection embed when a Drop id is present; otherwise token embed
 * for listed `s:` (and similar) resale announces.
 */
export function commerceEmbedFromDraft(drop: ComposerDropDraft) {
  if (drop.collectionId?.trim()) return collectionEmbedFromDraft(drop);
  return tokenEmbedFromDraft(drop);
}

/** Optional first-paint snapshot under `x.onsocial.drop`. */
export function dropSnapshotExtra(drop: ComposerDropDraft) {
  const collectionId = drop.collectionId?.trim() || '';
  const tokenId = drop.tokenId?.trim() || '';
  return {
    onsocial: {
      drop: {
        ...(collectionId ? { collectionId } : {}),
        ...(tokenId ? { tokenId } : {}),
        title: drop.title.trim() || collectionId || tokenId || 'Drop',
        ...(drop.mediaUrl?.trim() ? { mediaUrl: drop.mediaUrl.trim() } : {}),
        ...(drop.mediumKind?.trim()
          ? { mediumKind: drop.mediumKind.trim().toLowerCase() }
          : {}),
        ...(drop.sourcePostPath?.trim()
          ? { sourcePostPath: drop.sourcePostPath.trim() }
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
  if (!isDropComposeDraftReady(drop)) return '';
  return (
    drop!.title.trim() ||
    drop!.collectionId?.trim() ||
    drop!.tokenId?.trim() ||
    'Drop'
  );
}

export function dropPostKind(drop: ComposerDropDraft | null | undefined) {
  if (!isDropComposeDraftReady(drop)) return undefined;
  return postKindFromDropMedium(drop!.mediumKind);
}
