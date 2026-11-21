'use client';

import { useLayoutEffect, useState } from 'react';
import {
  assignStableFeedBlockKeys,
  feedBlockMemberKeys,
  type CoalescedFeedBlock,
  type FeedBlockKeyState,
} from '@/lib/feed-threads';

type Snapshot = {
  /** Membership fingerprint — not array identity (coalesce reallocates). */
  signature: string;
  keys: string[];
  state: FeedBlockKeyState[];
};

function blocksSignature(blocks: readonly CoalescedFeedBlock[]): string {
  if (blocks.length === 0) return '';
  return blocks
    .map((block) => [...feedBlockMemberKeys(block)].sort().join('+'))
    .join('|');
}

/**
 * React/window keys that survive coalesce reshapes. Optional `onState`
 * mirrors membership to the parent (size-cache retain) after paint.
 */
export function useStableFeedBlockKeys(
  blocks: readonly CoalescedFeedBlock[],
  onState?: (state: FeedBlockKeyState[]) => void
): string[] {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    const assigned = assignStableFeedBlockKeys(blocks);
    return {
      signature: blocksSignature(blocks),
      keys: assigned.keys,
      state: assigned.state,
    };
  });

  const signature = blocksSignature(blocks);
  // Adjust during render when membership changes (React restarts).
  if (snapshot.signature !== signature) {
    const assigned = assignStableFeedBlockKeys(blocks, snapshot.state);
    setSnapshot({
      signature,
      keys: assigned.keys,
      state: assigned.state,
    });
  }

  useLayoutEffect(() => {
    onState?.(snapshot.state);
  }, [onState, snapshot.state]);

  return snapshot.keys;
}
