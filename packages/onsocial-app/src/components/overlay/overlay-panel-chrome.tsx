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
  scrollBodyRef,
}: {
  ariaTitle: string;
  title?: string;
  toolbar?: ReactNode;
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

  const headerContent = toolbar ? (
    <>
      <h2 id="overlay-title" className="sr-only">
        {ariaTitle}
      </h2>
      {toolbar}
    </>
  ) : (
    <div className="glass-sheet-header">
      <div className="glass-sheet-header-copy">
        {title ? (
          <h2 id="overlay-title" className="glass-sheet-header-title">
            {title}
          </h2>
        ) : null}
      </div>
      <SheetCloseButton
        onClick={close}
        ariaLabel={`Close ${title ?? ariaTitle}`}
      />
    </div>
  );

  return createPortal(
    <>
      {headerContent}
      <Divider variant="section" className="glass-sheet-header-divider" />
    </>,
    headerPortal
  );
}
