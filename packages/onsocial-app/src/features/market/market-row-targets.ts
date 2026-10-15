import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { collectionPath } from '@/lib/app-routes';

/**
 * Catalog row opens the drop.
 * A post scarce with no drop still opens the post.
 * Show pass / Mint stay on their buttons. The creator cluster is its own link.
 */
export function marketListingRowTarget(input: {
  collectionId?: string | null;
  tokenId?: string | null;
  postHref?: string | null;
}): { href: string; kind: 'drop' | 'post' } | null {
  const collectionId =
    input.collectionId?.trim() ||
    collectionIdFromTokenId(input.tokenId ?? '') ||
    '';
  if (collectionId) {
    return { href: collectionPath(collectionId), kind: 'drop' };
  }
  const postHref = input.postHref?.trim() || '';
  if (!postHref) return null;
  return { href: postHref, kind: 'post' };
}
