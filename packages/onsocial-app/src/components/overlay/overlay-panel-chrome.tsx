'use client';

import { useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  useOverlayChromeRegister,
  useOverlayHeaderPortal,
} from '@/contexts/overlay-chrome-context';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { SheetCloseButton } from '@onsocial/ui';

export function OverlayPanelChrome({
  ariaTitle,
  title,
  hideTitle = false,
  toolbar,
  headerActions,
  scrollBodyRef,
}: {
  ariaTitle: string;
  title?: string;
  /** Close only — no visual title (About is the person). */
  hideTitle?: boolean;
  toolbar?: ReactNode;
  /** Icon actions before close — same cluster as Standing / Boost. */
  headerActions?: ReactNode;
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
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
  ) : hideTitle ? (
    <header className="glass-sheet-header glass-sheet-header--quiet">
      <h2 id="overlay-title" className="sr-only">
        {ariaTitle}
      </h2>
      <div className="glass-sheet-header-title-row glass-sheet-header-title-row--quiet">
        <div className="standing-sheet-actions standing-sheet-actions--payout">
          {headerActions}
          {closeControl}
        </div>
      </div>
    </header>
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

  return createPortal(headerContent, headerPortal);
}
