'use client';

import { useSyncExternalStore } from 'react';
import { MESSAGES_NARROW_MAX_PX } from '@/features/messages/messages-screen-chrome';

const NARROW_QUERY = `(max-width: ${MESSAGES_NARROW_MAX_PX}px)`;

function subscribeNarrow(onStoreChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function getNarrowSnapshot() {
  return window.matchMedia(NARROW_QUERY).matches;
}

/** Matches the Messages split breakpoint. SSR / first paint is desktop. */
export function useMessagesNarrow() {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, () => false);
}
