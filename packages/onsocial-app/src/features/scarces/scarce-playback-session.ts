import { collectionIdFromTokenId } from '@/features/market/market-listings';

/**
 * Shared now-playing id.
 * A drop id wins. An edition token (`drop:3`) resolves to that drop.
 * A one-off post scarce (`s:`) is its own id, so a second open joins it.
 */
export function scarcePlaybackSessionId(opts: {
  collectionId?: string | null;
  tokenId?: string | null;
}): string | null {
  const collectionId = opts.collectionId?.trim();
  if (collectionId) return collectionId;
  const tokenId = opts.tokenId?.trim();
  if (!tokenId) return null;
  return collectionIdFromTokenId(tokenId) ?? tokenId;
}

/**
 * Mounting a face may claim a silent dock. It must not replace a release
 * that is already the session.
 */
export function shouldAdoptPlaybackSession(opts: {
  currentId: string | null;
  nextId: string;
}): boolean {
  const nextId = opts.nextId.trim();
  if (!nextId) return false;
  const currentId = opts.currentId?.trim() || null;
  return currentId == null || currentId === nextId;
}

/** Play on a different release takes the dock. The same release stays put. */
export function shouldTakeOverPlayback(opts: {
  sessionId: string | null;
  surfaceId: string | null;
}): boolean {
  const surfaceId = opts.surfaceId?.trim() || null;
  const sessionId = opts.sessionId?.trim() || null;
  return Boolean(surfaceId && sessionId && sessionId !== surfaceId);
}
