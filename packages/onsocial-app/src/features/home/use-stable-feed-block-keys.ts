'use client';

import { useLayoutEffect, useState } from 'react';
import {
  assignStableFeedBlockKeys,
  type CoalescedFeedBlock,
  type FeedBlockKeyState,
} from '@/lib/feed-threads';

type Snapshot = {
  blocks: readonly CoalescedFeedBlock[];
  keys: string[];
  state: FeedBlockKeyState[];
};

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
    return { blocks, keys: assigned.keys, state: assigned.state };
  });

  // Adjust during render when the block list identity changes (React restarts).
  if (snapshot.blocks !== blocks) {
    const assigned = assignStableFeedBlockKeys(blocks, snapshot.state);
    setSnapshot({ blocks, keys: assigned.keys, state: assigned.state });
  }

  useLayoutEffect(() => {
    onState?.(snapshot.state);
  }, [onState, snapshot.state]);

  return snapshot.keys;
}
