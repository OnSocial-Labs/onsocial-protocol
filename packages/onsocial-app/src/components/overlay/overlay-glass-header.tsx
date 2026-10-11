'use client';

import { usePathname } from 'next/navigation';
import { SheetCloseButton } from '@onsocial/ui';
import {
  getNetworkStandingHandoffOpenTarget,
  getStandingOpeningFace,
} from '@/components/panels/network-standing-handoff';
import {
  useOverlayChrome,
  useOverlayHeaderPortalTarget,
} from '@/contexts/overlay-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import {
  accountIdFromPath,
  resolveOverlayPanelChrome,
  type OverlayPanelChromeHint,
} from '@/lib/overlay-routes';

/** Same band as the settled standing header, so the list does not drop in. */
function StandingHeaderFallback({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() ?? '';
  const handoff = getNetworkStandingHandoffOpenTarget();
  const accountId = handoff?.accountId ?? accountIdFromPath(pathname);
  const face = accountId ? getStandingOpeningFace(accountId) : null;
  const label = face?.displayName.trim() || accountId || '';

  return (
    <div className="standing-sheet-header standing-sheet-header--compact overlay-header-fallback">
      <div className="standing-sheet-subject-row">
        {label ? (
          <div className="standing-sheet-subject">
            <span className="standing-sheet-subject-copy">
              <span className="standing-sheet-subject-name">{label}</span>
            </span>
          </div>
        ) : (
          <div className="standing-sheet-subject standing-sheet-subject--skeleton">
            <span className="standing-sheet-subject-copy">
              <span className="standing-row-shimmer standing-row-shimmer-line standing-sheet-subject-shimmer-name" />
            </span>
          </div>
        )}
        <div className="standing-sheet-actions">
          <span className="standing-sheet-discover-slot" aria-hidden />
          <span className="standing-sheet-discover-slot" aria-hidden />
          <SheetCloseButton onClick={onClose} ariaLabel="Close Standing" />
        </div>
      </div>
      <div
        className="os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail"
        aria-hidden
      />
    </div>
  );
}

function OverlayHeaderFallback({
  panelKey,
  hint,
  onClose,
}: {
  panelKey: string;
  hint: OverlayPanelChromeHint;
  onClose: () => void;
}) {
  const closeLabel = `Close ${hint.title ?? hint.ariaTitle}`;
  const closeControl = (
    <SheetCloseButton onClick={onClose} ariaLabel={closeLabel} />
  );

  if (hint.expectsToolbar) {
    const toolbarFallback = panelKey.startsWith('standing:') ? (
      <StandingHeaderFallback onClose={onClose} />
    ) : panelKey === 'discover' ? (
      <div className="standing-sheet-header discover-sheet-header overlay-header-fallback">
        <div className="discover-sheet-nav-row" aria-hidden>
          <div className="discover-omni-search" />
          {closeControl}
        </div>
      </div>
    ) : panelKey === 'feed' ? (
      <div className="standing-sheet-header profile-feed-sheet-header overlay-header-fallback">
        <div className="discover-sheet-title-row" aria-hidden>
          <div className="discover-tab-bar discover-tab-bar--header profile-feed-tab-bar">
            <div className="discover-tab-bar-scroller">
              <span className="standing-row-shimmer profile-feed-tab-fallback-chip" />
              <span className="standing-row-shimmer profile-feed-tab-fallback-chip" />
              <span className="standing-row-shimmer profile-feed-tab-fallback-chip" />
              <span className="standing-row-shimmer profile-feed-tab-fallback-chip" />
            </div>
          </div>
          {closeControl}
        </div>
      </div>
    ) : (
      <div className="standing-sheet-header overlay-header-fallback">
        <div className="standing-sheet-subject-row" aria-hidden>
          <div className="standing-sheet-subject" />
          <div className="standing-sheet-actions">{closeControl}</div>
        </div>
      </div>
    );

    return (
      <>
        <h2 id="overlay-title" className="sr-only">
          {hint.ariaTitle}
        </h2>
        {toolbarFallback}
      </>
    );
  }

  if (hint.hideTitle) {
    return (
      <h2 id="overlay-title" className="sr-only">
        {hint.ariaTitle}
      </h2>
    );
  }

  const title = hint.title ?? hint.ariaTitle;

  return (
    <header className="glass-sheet-header overlay-header-fallback">
      <div className="glass-sheet-header-copy">
        <div className="glass-sheet-header-title-row">
          <h2 id="overlay-title" className="glass-sheet-header-title">
            {title}
          </h2>
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            {closeControl}
          </div>
        </div>
      </div>
    </header>
  );
}

/** Portal mount + route-derived header until panel chrome registers. */
export function OverlayGlassHeader({ panelKey }: { panelKey: string | null }) {
  const setHeaderPortal = useOverlayHeaderPortalTarget();
  const hint = resolveOverlayPanelChrome(panelKey);
  const chrome = useOverlayChrome();
  const close = useOverlayDismiss();
  const showFallback = hint != null && chrome == null;
  const flushHeader = chrome?.hideHeader ?? Boolean(hint?.hideTitle);

  return (
    <div
      ref={setHeaderPortal}
      className={
        flushHeader
          ? 'overlay-header-portal overlay-header-portal--flush'
          : 'overlay-header-portal'
      }
    >
      {showFallback && panelKey != null ? (
        <OverlayHeaderFallback
          panelKey={panelKey}
          hint={hint}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
