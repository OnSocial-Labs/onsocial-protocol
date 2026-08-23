'use client';

import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  useOverlayChromeRegister,
  useOverlayHeaderPortal,
} from '@/contexts/overlay-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { Divider, SheetCloseButton } from '@onsocial/ui';

export function OverlayPanelChrome({
  ariaTitle,
  title,
  toolbar,
  headerActions,
  scrollBodyRef,
  showHeaderDivider = true,
}: {
  ariaTitle: string;
  title?: string;
  toolbar?: ReactNode;
  /** Icon actions before close — same cluster as Standing / Boost. */
  headerActions?: ReactNode;
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
  /** Section divider under header. Off when tabs already close the chrome. */
  showHeaderDivider?: boolean;
}) {
  const registerChrome = useOverlayChromeRegister();
  const headerPortal = useOverlayHeaderPortal();
  const close = useOverlayDismiss();

  useLayoutEffect(() => {
    registerChrome({ ariaTitle, scrollBodyRef });
  }, [ariaTitle, registerChrome, scrollBodyRef]);

  if (!headerPortal) {
    return null;
  }

  const closeControl = (
    <SheetCloseButton
      onClick={close}
      ariaLabel={`Close ${title ?? ariaTitle}`}
    />
  );

  const headerContent = toolbar ? (
    <>
      <h2 id="overlay-title" className="sr-only">
        {ariaTitle}
      </h2>
      {toolbar}
    </>
  ) : (
    <header className="glass-sheet-header">
      <div className="glass-sheet-header-copy">
        <div className="glass-sheet-header-title-row">
          <h2 id="overlay-title" className="glass-sheet-header-title">
            {title ?? ariaTitle}
          </h2>
          <div className="standing-sheet-actions standing-sheet-actions--payout">
            {headerActions}
            {closeControl}
          </div>
        </div>
      </div>
    </header>
  );

  return createPortal(
    <>
      {headerContent}
      {showHeaderDivider ? (
        <Divider variant="section" className="glass-sheet-header-divider" />
      ) : null}
    </>,
    headerPortal
  );
}
