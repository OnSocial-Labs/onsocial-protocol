'use client';

/**
 * Boots mute + block ledgers for the signed-in viewer.
 * Mount once under wallet + transaction feedback providers.
 */
import { useViewerMute } from '@/hooks/use-viewer-mute';
import { useViewerBlock } from '@/hooks/use-viewer-block';

export function ViewerMuteBlockHost() {
  useViewerMute();
  useViewerBlock();
  return null;
}
