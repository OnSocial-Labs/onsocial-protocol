'use client';

import { SheetCloseButton } from '@onsocial/ui';
import { ContextualBack } from '@/components/app/contextual-back';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import { StandingListToolbar } from '@/components/panels/standing-list-toolbar';
import { StandingSheetSubject } from '@/components/panels/standing-sheet-subject';
import { portfolioPath } from '@/lib/overlay-routes';

export function StandingSheetHeader() {
  const { shellVariant, accountId } = useStandingPanel();
  const close = useOverlayDismiss();
  const isOverlay = shellVariant === 'overlay';

  return (
    <div className="standing-sheet-header">
      <StandingSheetSubject
        leading={
          isOverlay ? null : (
            <ContextualBack fallbackHref={portfolioPath(accountId)} />
          )
        }
        trailing={
          <div className="standing-sheet-actions">
            <span className="standing-sheet-discover-slot">
              <StandingDiscoverLink
                variant="chrome"
                closeOverlay={isOverlay}
              />
            </span>
            {isOverlay ? (
              <SheetCloseButton
                onClick={close}
                ariaLabel="Close Standing"
              />
            ) : null}
          </div>
        }
      />

      <div className="standing-sheet-toolbar-row">
        <StandingListToolbar />
      </div>
    </div>
  );
}
