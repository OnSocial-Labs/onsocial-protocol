'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GlobeIcon, OsIconAction, SheetCloseButton } from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import { StandingDiscoverLink } from '@/components/panels/standing-discover-link';
import { StandingListToolbar } from '@/components/panels/standing-list-toolbar';
import { StandingSheetSubject } from '@/components/panels/standing-sheet-subject';
import { networkPath } from '@/lib/overlay-routes';
import {
  clearNetworkStandingHandoff,
  clearStandingSheetCovered,
  getNetworkStandingHandoffPhase,
} from '@/components/panels/network-standing-handoff';

export function StandingSheetHeader() {
  const close = useOverlayDismiss();
  const router = useRouter();
  const { accountId } = useStandingPanel();

  return (
    <div className="standing-sheet-header standing-sheet-header--compact">
      <StandingSheetSubject
        trailing={
          <div className="standing-sheet-actions">
            <OsIconAction asChild ariaLabel="Open network map">
              <Link
                href={networkPath(accountId)}
                scroll={false}
                aria-label="Open network map"
                onClick={(event) => {
                  const phase = getNetworkStandingHandoffPhase();
                  if (
                    phase === 'open' &&
                    event.currentTarget.closest('.standing-early-sheet')
                  ) {
                    event.preventDefault();
                    clearNetworkStandingHandoff();
                    router.replace(networkPath(accountId), { scroll: false });
                    return;
                  }
                  clearStandingSheetCovered();
                  if (phase === 'close') {
                    clearNetworkStandingHandoff();
                  }
                }}
              >
                <GlobeIcon
                  className="glass-sheet-icon-action-glyph"
                  aria-hidden
                />
              </Link>
            </OsIconAction>
            <span className="standing-sheet-discover-slot">
              <StandingDiscoverLink variant="chrome" closeOverlay />
            </span>
            <SheetCloseButton onClick={close} ariaLabel="Close Standing" />
          </div>
        }
      />

      <div className="os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail">
        <StandingListToolbar />
      </div>
    </div>
  );
}
