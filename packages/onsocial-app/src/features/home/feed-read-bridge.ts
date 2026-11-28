'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import type { PostRow } from '@onsocial/sdk';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import type { PostEngagement } from '@/lib/post-engagement-model';

/**
 * The feed card stays mounted under the covered column and already owns
 * commerce sheets. The stack paints the reader and reads this live footer.
 */
export type FeedReadBridge = {
  key: string;
  authorProfile?: PostAuthorProfile;
  engagement: PostEngagement;
  countsReady: boolean;
  reactionPending?: boolean;
  savePending?: boolean;
  sharePending?: boolean;
  shareHref: string;
  shareTitle: string;
  onQuote?: (post: PostRow) => void;
  onRepost?: (post: PostRow) => void;
  onUndoRepost?: (post: PostRow) => void;
  onToggleReaction?: (post: PostRow) => void;
  onToggleSave?: (post: PostRow) => void;
  onAmplify: () => void;
  commerce: ReactNode;
};

type FeedReadBridgeState = {
  openKey: string | null;
  bridge: FeedReadBridge | null;
};

let state: FeedReadBridgeState = { openKey: null, bridge: null };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setOpenFeedReadKey(key: string | null) {
  if (state.openKey === key) return;
  state = { ...state, openKey: key };
  emit();
}

export function publishFeedReadBridge(bridge: FeedReadBridge) {
  state = { ...state, bridge };
  emit();
}

export function clearFeedReadBridge(key: string) {
  if (state.bridge?.key !== key) return;
  state = { ...state, bridge: null };
  emit();
}

export function useOpenFeedReadKey(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.openKey,
    () => null
  );
}

export function useFeedReadBridge(key: string): FeedReadBridge | null {
  return useSyncExternalStore(
    subscribe,
    () => (state.bridge?.key === key ? state.bridge : null),
    () => null
  );
}
