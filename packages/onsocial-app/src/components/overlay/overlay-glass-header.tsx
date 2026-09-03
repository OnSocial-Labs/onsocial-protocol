'use client';

import { SheetCloseButton } from '@onsocial/ui';
import {
  useOverlayChrome,
  useOverlayHeaderPortalTarget,
} from '@/contexts/overlay-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import {
  resolveOverlayPanelChrome,
  type OverlayPanelChromeHint,
} from '@/lib/overlay-routes';

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
      <div className="standing-sheet-header overlay-header-fallback">
        <div className="standing-sheet-subject-row" aria-hidden>
          <div className="standing-sheet-subject" />
          <div className="standing-sheet-actions">
            <span className="standing-sheet-discover-slot" />
            {closeControl}
          </div>
        </div>
      </div>
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
      <header className="glass-sheet-header glass-sheet-header--quiet overlay-header-fallback">
        <h2 id="overlay-title" className="sr-only">
          {hint.ariaTitle}
        </h2>
        <div className="glass-sheet-header-title-row glass-sheet-header-title-row--quiet">
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            {closeControl}
          </div>
        </div>
      </header>
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

  return (
    <div ref={setHeaderPortal} className="overlay-header-portal">
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
