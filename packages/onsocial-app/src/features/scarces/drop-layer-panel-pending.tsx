'use client';

import { OsAppScreen } from '@/components/app/os-app-screen';
import { useClaimDropSheetCompose } from '@/contexts/compose-launcher-context';
import { CollectionPageSkeleton } from '@/features/scarces/collection-page-skeleton';

/**
 * Soft Drop sheet while the CollectionPagePanel chunk is still loading.
 * Same jacket as a cold catalog miss — not a second design. Claims blank
 * compose so underlay Mint/pen cannot sit on the pill during the gap.
 * Layer already owns Back via useClaimDropSheetDockBack.
 */
export function DropLayerPanelPending() {
  useClaimDropSheetCompose(true, null);
  return (
    <OsAppScreen title="Drop" embedded immersiveHeader>
      <div className="collection-drop-settle">
        <CollectionPageSkeleton />
      </div>
    </OsAppScreen>
  );
}
