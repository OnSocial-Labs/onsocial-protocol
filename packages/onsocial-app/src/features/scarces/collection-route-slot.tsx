'use client';

import { CollectionPagePanel } from '@/features/scarces/collection-page-panel';
import type { CollectionCreatorFace } from '@/features/scarces/collection-creator-face';
import type { CollectionView } from '@/features/scarces/collections-data';
import type { CollectionActivityRow } from '@/features/scarces/collection-activity-rows';

export type CollectionRouteSlotProps = {
  collectionId: string;
  initial: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  initialActivity?: CollectionActivityRow[];
  initialViewerAccountId?: string | null;
  initialHoldSeed?: { holds: boolean; tokenId: string | null } | null;
  initialEditionToken?: string | null;
};

/**
 * Hard refresh / share route paint. Soft taps open `DropLayerSheet` instead —
 * this slot is the real `/collection/[id]` document only.
 */
export function CollectionRouteSlot(props: CollectionRouteSlotProps) {
  return <CollectionPagePanel {...props} />;
}
