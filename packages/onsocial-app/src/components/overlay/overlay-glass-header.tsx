'use client';

import { Divider, SheetCloseButton } from '@onsocial/ui';
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
  hint,
  onClose,
}: {
  hint: OverlayPanelChromeHint;
  onClose: () => void;
}) {
  if (hint.expectsToolbar) {
    return (
      <>
        <h2 id="overlay-title" className="sr-only">
          {hint.ariaTitle}
        </h2>
        <div className="glass-sheet-header overlay-header-fallback">
          <div className="glass-sheet-header-copy" aria-hidden />
          <SheetCloseButton
            onClick={onClose}
            ariaLabel={`Close ${hint.ariaTitle}`}
          />
        </div>
        <Divider variant="section" className="glass-sheet-header-divider" />
      </>
    );
  }

  const title = hint.title ?? hint.ariaTitle;

  return (
    <>
      <div className="glass-sheet-header overlay-header-fallback">
        <div className="glass-sheet-header-copy">
          <h2 id="overlay-title" className="glass-sheet-header-title">
            {title}
          </h2>
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel={`Close ${title}`} />
      </div>
      <Divider variant="section" className="glass-sheet-header-divider" />
    </>
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
      {showFallback ? (
        <OverlayHeaderFallback hint={hint} onClose={close} />
      ) : null}
    </div>
  );
}
