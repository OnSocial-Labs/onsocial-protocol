'use client';

import { useCallback, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OsPageSheet } from '@onsocial/ui';
import { OverlayGlassHeader } from '@/components/overlay/overlay-glass-header';
import { StandingOverlaySheet } from '@/components/panels/standing-panel';
import {
  clearNetworkStandingHandoff,
  markStandingSheetCovered,
} from '@/components/panels/network-standing-handoff';
import { OverlayChromeProvider } from '@/contexts/overlay-chrome-context';
import { OverlayDismissProvider } from '@/contexts/overlay-dismiss-context';
import { networkPath } from '@/lib/overlay-routes';
import { parseStandingKindFromPathname } from '@/lib/profile-social-standings';
import { SHEET_Z } from '@/lib/sheet-z';

export type StandingHandoffOpenTarget = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  href: string;
};

function queryFromHref(href: string): string {
  const query = href.split('?')[1];
  if (!query) return '';
  return new URLSearchParams(query).get('q') ?? '';
}

/**
 * Standing chrome for a map list click, before that person's route exists.
 * Portaled into the frozen map so the sheet can fade in on the click. The
 * real overlay stays hidden until it can replace this one without a second fade.
 */
export function NetworkStandingEarlySheet({
  target,
}: {
  target: StandingHandoffOpenTarget;
}) {
  const router = useRouter();
  const kind = parseStandingKindFromPathname(target.href) ?? 'incoming';
  const portal =
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(
          '#standing-handoff-hold .os-app-screen'
        );

  useLayoutEffect(() => {
    document.documentElement.dataset.standingEarly = 'open';
    markStandingSheetCovered();
    return () => {
      delete document.documentElement.dataset.standingEarly;
    };
  }, []);

  const onDismiss = useCallback(() => {
    clearNetworkStandingHandoff();
    router.replace(networkPath(target.accountId), { scroll: false });
  }, [router, target.accountId]);

  if (!portal) return null;

  const name = target.displayName.trim() || target.accountId;

  return (
    <OverlayChromeProvider>
      <OverlayDismissProvider
        accountId={target.accountId}
        overlayPresent
        onRequestDismiss={onDismiss}
      >
        {({ sheetOpen, requestDismiss }) => (
          <OsPageSheet
            open={sheetOpen}
            onClose={requestDismiss}
            presentation="appear"
            portalContainer={portal}
            rootClassName="standing-early-sheet"
            zIndex={SHEET_Z.overlayHost}
            ariaLabelledBy="overlay-title"
            backdropLabel="Close panel"
            header={<OverlayGlassHeader panelKey={`standing:${kind}`} />}
          >
            <StandingOverlaySheet
              accountId={target.accountId}
              kind={kind}
              initialQuery={queryFromHref(target.href)}
              displayName={name}
              avatarUrl={target.avatarUrl}
              initialCounts={{ incoming: 0, outgoing: 0, mutual: 0 }}
              profileMetaFromServer
              listPreview
              syncUrl={false}
            />
          </OsPageSheet>
        )}
      </OverlayDismissProvider>
    </OverlayChromeProvider>
  );
}
