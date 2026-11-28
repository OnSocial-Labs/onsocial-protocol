import { accountIdsEqual } from '@/lib/account-match';
import type { PostQuotesTab } from '@/lib/post-routes';

/**
 * Every layer kind the thread host can stack: post readers, quotes screens,
 * drops, and a Read opened from a drop. A guest Writing permalink opens as a
 * plain post layer; a portfolio face never layers (it parks the sheet and
 * navigates the underlay).
 */
export const PLACE_LAYER_KINDS = ['post', 'quotes', 'drop', 'read'] as const;
export type PlaceLayerKind = (typeof PLACE_LAYER_KINDS)[number];

export interface PostStackEntry {
  id: string;
  kind: 'post';
  accountId: string;
  postId: string;
  groupId: string | null;
  zIndex: number;
}

export interface QuotesStackEntry {
  id: string;
  kind: 'quotes';
  accountId: string;
  postId: string;
  groupId: string | null;
  tab: PostQuotesTab;
  zIndex: number;
}

export interface DropStackEntry {
  id: string;
  kind: 'drop';
  collectionId: string;
  zIndex: number;
}

/** Read opened from a drop. Same collection URL; the slide-over is the screen. */
export interface ReadStackEntry {
  id: string;
  kind: 'read';
  collectionId: string;
  zIndex: number;
}

export type PlaceStackEntry =
  | PostStackEntry
  | QuotesStackEntry
  | DropStackEntry
  | ReadStackEntry;

export interface ReaderStackTarget {
  kind: 'post' | 'quotes';
  accountId: string;
  postId: string;
  groupId: string | null;
}

/** Reader layers step back one at a time; drops close the whole host. */
export function isReaderLayerKind(
  kind: PlaceLayerKind
): kind is 'post' | 'quotes' | 'read' {
  return kind === 'post' || kind === 'quotes' || kind === 'read';
}

/**
 * A post already on the trail is shown again by dropping whatever was opened
 * after it. The top entry stays put. A post that is not on the trail is a
 * new step.
 */
export function revealTrailReader<T extends PlaceStackEntry>(
  stack: readonly T[],
  target: ReaderStackTarget
): { stack: T[]; at: 'top' | 'back' } | null {
  let index = -1;
  for (let i = 0; i < stack.length; i += 1) {
    const entry = stack[i];
    if (entry && isSameReaderTarget(entry, target)) index = i;
  }
  if (index < 0) return null;
  if (index === stack.length - 1) return { stack: stack.slice(), at: 'top' };
  return { stack: stack.slice(0, index + 1), at: 'back' };
}

/** The same reader already on top — opening it again is a no-op. */
export function isSameReaderTarget(
  entry: PlaceStackEntry,
  target: ReaderStackTarget
): boolean {
  if (entry.kind === 'drop' || entry.kind === 'read') return false;
  if (entry.kind !== target.kind) return false;
  return (
    (entry.groupId ?? null) === target.groupId &&
    accountIdsEqual(entry.accountId, target.accountId) &&
    entry.postId === target.postId
  );
}

/**
 * A reply opened while a media face is up has to paint above that face.
 * `zIndex` is the pre-lift floor; the sheet adds `lift` when
 * `openedAboveMediaFace` is set. With no face, the trail keeps its floor.
 */
export function replyOpenedOverMediaFace(input: {
  trailZ: number;
  mediaFaceZ: number | null;
  lift: number;
}): { zIndex: number; openedAboveMediaFace: boolean } {
  if (input.mediaFaceZ == null) {
    return { zIndex: input.trailZ, openedAboveMediaFace: false };
  }
  return {
    zIndex: Math.max(input.trailZ, input.mediaFaceZ - input.lift + 1),
    openedAboveMediaFace: true,
  };
}

/**
 * Opening over an open reader trail parks the previous top only. Deeper
 * sheets unmount — long reply chains used to keep every LivePersonalPostPanel
 * mounted and made the next open sluggish.
 */
export function appendTrailEntry<S extends unknown[], E>(
  stack: S,
  next: E
): (S[number] | E)[] {
  if (stack.length === 0) return [next];
  const parent = stack[stack.length - 1] as S[number];
  return [parent, next];
}

/** Header back walks one step: a reply, then quotes, then the post. Browser Back uses the same step. Returns null when one entry remains — the sheet itself should close. */
export function walkBackOneStep<S extends { kind: PlaceLayerKind }[]>(
  stack: S
): S | null {
  const top = stack[stack.length - 1];
  if (stack.length > 1 && top && isReaderLayerKind(top.kind)) {
    return stack.slice(0, -1) as S;
  }
  return null;
}

/** A drop takes over the whole host — any reader trail unmounts. */
export function replaceStackWith<T>(next: T): T[] {
  return [next];
}

function sameCollectionId(left: string, right: string): boolean {
  try {
    return decodeURIComponent(left).trim() === decodeURIComponent(right).trim();
  } catch {
    return left.trim() === right.trim();
  }
}

/**
 * Drop tapped while Read already covers that drop.
 * Close the reader and show the drop again. A second drop sheet would
 * replace the one still mounted underneath.
 */
export function dropTapRevealsOpenDrop(
  stack: readonly { kind: PlaceLayerKind; collectionId?: string }[],
  collectionId: string
): boolean {
  const top = stack[stack.length - 1];
  if (!top || top.kind !== 'read' || !top.collectionId) return false;
  if (!sameCollectionId(top.collectionId, collectionId)) return false;
  if (stack.length === 1) return true;
  const parent = stack[stack.length - 2];
  return (
    parent?.kind === 'drop' &&
    typeof parent.collectionId === 'string' &&
    sameCollectionId(parent.collectionId, collectionId)
  );
}

/** Re-opening the same quotes screen retabs in place — no stack growth. */
export function retabTopQuotes<T extends PlaceStackEntry>(
  stack: T[],
  tab: PostQuotesTab
): T[] {
  return stack.map((item, index) =>
    index === stack.length - 1 && item.kind === 'quotes'
      ? ({ ...item, tab } as T)
      : item
  );
}
