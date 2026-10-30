'use client';

import { useSyncExternalStore } from 'react';

const CLOSE_MEDIA_FACES_EVENT = 'os-close-media-faces';

/**
 * Leave the film for good — the post on screen is the destination.
 * A reply opened from the film does not use this. The film stays, and
 * back returns to it.
 */
export function requestCloseMediaFaces(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CLOSE_MEDIA_FACES_EVENT));
}

export function onCloseMediaFaces(close: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CLOSE_MEDIA_FACES_EVENT, close);
  return () => window.removeEventListener(CLOSE_MEDIA_FACES_EVENT, close);
}

let mediaFacesHeld = false;
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
