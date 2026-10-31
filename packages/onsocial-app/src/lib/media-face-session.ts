'use client';

import { useSyncExternalStore } from 'react';
import { topReplySheetZ } from '@/lib/single-media-playback';

const CLOSE_MEDIA_FACES_EVENT = 'os-close-media-faces';
const CLOSE_MEDIA_FACE_EVENT = 'os-close-media-face';
const RESUME_MEDIA_FACE_EVENT = 'os-resume-media-face';
const DISMISS_REPLY_DRAWERS_EVENT = 'os-dismiss-reply-drawers';

/** One open film per post. The slide-over root carries this key. */
export function mediaFacePostKey(accountId: string, postId: string): string {
  return `${accountId}/${postId}`;
}

function openMediaFaces(postKey: string): HTMLElement[] {
  if (typeof document === 'undefined' || typeof CSS === 'undefined') return [];
  const selector = `[data-os-slide-over="true"][data-os-media-post="${CSS.escape(postKey)}"]`;
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (face) => !face.classList.contains('is-closing')
  );
}

function faceClearsReply(face: HTMLElement): boolean {
  const sheetZ = topReplySheetZ(face.ownerDocument);
  if (sheetZ == null) return true;
  const z = Number(getComputedStyle(face).zIndex);
  return Number.isFinite(z) && z > sheetZ;
}

/**
 * The film node is portaled, so it is not inside the reply.
 * The card that owns the sound is. Closing the reply unmounts that card.
 */
function faceSurvivesDrawerClose(face: HTMLElement): boolean {
  const id = face.getAttribute('data-os-face-owner');
  if (id && typeof CSS !== 'undefined') {
    const owner = face.ownerDocument.querySelector(
      `[data-os-player-owner="${CSS.escape(id)}"]`
    );
    if (owner instanceof HTMLElement) {
      return !owner.closest('.glass-sheet-root');
    }
  }
  return !face.closest('.glass-sheet-root');
}

function faceMedia(face: HTMLElement): HTMLMediaElement | null {
  const id = face.getAttribute('data-os-face-owner');
  const root =
    id && typeof CSS !== 'undefined'
      ? face.ownerDocument.querySelector(
          `[data-os-player-owner="${CSS.escape(id)}"]`
        )
      : face;
  const media = (root instanceof HTMLElement ? root : face).querySelector(
    'audio, video'
  );
  return media instanceof HTMLMediaElement ? media : null;
}

/** A film inside a hidden sheet or a covered feed is not one the cover can show. */
function faceIsReachable(face: HTMLElement): boolean {
  if (!face.isConnected) return false;
  if (face.closest('.post-thread-sheet-parked, .glass-sheet-root.is-closing')) {
    return false;
  }
  const session = face.closest('[data-feed-session]');
  if (session?.getAttribute('data-feed-session') === 'covered') return false;
  let parent = face.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    parent = parent.parentElement;
  }
  return true;
}

/**
 * This post's film is already the one to play.
 * A film the reply hid comes back. A film already above the reply just plays.
 * A film still under the reply is left alone, so the cover opens another
 * one above that reply.
 */
export function revealOpenMediaFace(
  accountId: string,
  postId: string
): boolean {
  if (typeof document === 'undefined') return false;
  const faces = openMediaFaces(mediaFacePostKey(accountId, postId));
  for (const face of faces) {
    if (faceIsReachable(face)) continue;
    face.dispatchEvent(new Event(CLOSE_MEDIA_FACE_EVENT));
  }
  const reachable = faces.filter(faceIsReachable);
  const yielded = reachable.filter((face) =>
    face.classList.contains('is-yielded')
  );
  const showing = reachable.filter(
    (face) =>
      !face.classList.contains('is-yielded') &&
      !face.classList.contains('is-covered') &&
      !face.inert &&
      faceClearsReply(face)
  );
  // Coming back to a film the reply hid. Keep the copy whose card is on
  // the feed — that card is still there after the drawers close. A film
  // still under the reply is not reused, so More from opens another above.
  const durable = reachable.filter(faceSurvivesDrawerClose);
  const keeper =
    (yielded.length > 0 ? durable[durable.length - 1] : undefined) ??
    yielded[yielded.length - 1] ??
    showing[showing.length - 1];
  if (!keeper) return false;
  const leaving = yielded.find((face) => face !== keeper);
  const from = leaving ? faceMedia(leaving) : null;
  const onto = faceMedia(keeper);
  if (
    from &&
    onto &&
    from !== onto &&
    Number.isFinite(from.currentTime) &&
    from.currentTime > 0.35
  ) {
    onto.currentTime = from.currentTime;
  }
  for (const face of faces) {
    if (face === keeper) continue;
    face.dispatchEvent(new Event(CLOSE_MEDIA_FACE_EVENT));
  }
  setMediaFacesYielded(false);
  if (faceSurvivesDrawerClose(keeper)) dismissReplyDrawers();
  keeper.dispatchEvent(new Event(RESUME_MEDIA_FACE_EVENT, { bubbles: true }));
  return true;
}

/** This card's film is on screen, so a cover tap can show it. */
export function hasReachableMediaFace(
  accountId: string,
  postId: string
): boolean {
  if (typeof document === 'undefined') return false;
  return openMediaFaces(mediaFacePostKey(accountId, postId)).some(
    faceIsReachable
  );
}

/**
 * The cover tap chose the film. Reply sheets and the band on the film close.
 * Header Back does not use this — that step keeps the drawer open.
 */
export function dismissReplyDrawers(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DISMISS_REPLY_DRAWERS_EVENT));
}

export function onDismissReplyDrawers(dismiss: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(DISMISS_REPLY_DRAWERS_EVENT, dismiss);
  return () => window.removeEventListener(DISMISS_REPLY_DRAWERS_EVENT, dismiss);
}

/** Live flag. A cover tap clears this before play, so a hide-listener must not stop it. */
export function mediaFacesYieldedNow(): boolean {
  return mediaFacesYielded;
}

/** The cover tap asked this film to play. Only the face that received it starts. */
export function onResumeMediaFace(
  play: (face: HTMLElement) => void
): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const face = event.target;
    if (!(face instanceof HTMLElement)) return;
    if (!face.hasAttribute('data-os-media-post')) return;
    play(face);
  };
  document.addEventListener(RESUME_MEDIA_FACE_EVENT, handler);
  return () => document.removeEventListener(RESUME_MEDIA_FACE_EVENT, handler);
}

/** Drop one film. A second copy of the same post uses this so only one stays. */
export function onCloseThisMediaFace(
  face: EventTarget,
  close: () => void
): () => void {
  face.addEventListener(CLOSE_MEDIA_FACE_EVENT, close);
  return () => face.removeEventListener(CLOSE_MEDIA_FACE_EVENT, close);
}

/**
 * Leave the film for good — the post on screen is the destination.
 * A reply opened from the film does not use this. The film stays, and
 * back returns to it.
 */
export function requestCloseMediaFaces(): void {
  setMediaFacesYielded(false);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLOSE_MEDIA_FACES_EVENT));
}

export function onCloseMediaFaces(close: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CLOSE_MEDIA_FACES_EVENT, close);
  return () => window.removeEventListener(CLOSE_MEDIA_FACES_EVENT, close);
}

let mediaFacesHeld = false;
let mediaFaceCoverEpoch = 0;
let mediaFacesYielded = false;
const mediaFaceHoldListeners = new Set<() => void>();

/** A reply sheet is covering the open film. Players pause and resume from here. */
export function setMediaFacesHeld(held: boolean): void {
  if (mediaFacesHeld === held) return;
  mediaFacesHeld = held;
  for (const listener of mediaFaceHoldListeners) listener();
}

export function useMediaFacesHeld(): boolean {
  return useSyncExternalStore(
    (listener) => {
      mediaFaceHoldListeners.add(listener);
      return () => mediaFaceHoldListeners.delete(listener);
    },
    () => mediaFacesHeld,
    () => false
  );
}

/**
 * The open reply moved over a film that was already held.
 * Players re-check coverage. `facesHeld` itself does not flip.
 */
export function bumpMediaFaceCover(): void {
  mediaFaceCoverEpoch += 1;
  for (const listener of mediaFaceHoldListeners) listener();
}

export function useMediaFaceCoverEpoch(): number {
  return useSyncExternalStore(
    (listener) => {
      mediaFaceHoldListeners.add(listener);
      return () => mediaFaceHoldListeners.delete(listener);
    },
    () => mediaFaceCoverEpoch,
    () => 0
  );
}

/**
 * The reply already on screen is the one that was tapped.
 * The film steps aside and keeps its element, so the playhead and the
 * launcher hold stay on that element. The next cover tap brings it back.
 */
export function setMediaFacesYielded(yielded: boolean): void {
  if (mediaFacesYielded === yielded) return;
  mediaFacesYielded = yielded;
  for (const listener of mediaFaceHoldListeners) listener();
}

export function useMediaFacesYielded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      mediaFaceHoldListeners.add(listener);
      return () => mediaFaceHoldListeners.delete(listener);
    },
    () => mediaFacesYielded,
    () => false
  );
}
