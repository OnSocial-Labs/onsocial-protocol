'use client';

import type { ReactNode, RefObject } from 'react';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import {
  OverlayDismissProvider,
  type GlassSheetDetent,
} from '@/contexts/overlay-dismiss-context';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';

interface GlassOverlayShellProps {
  accountId: string;
  title?: string;
  description?: string;
  toolbar?: ReactNode;
  initialDetent?: GlassSheetDetent;
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

export function GlassOverlayShell({
  accountId,
  title,
  description,
  toolbar,
  initialDetent = 'full',
  scrollBodyRef,
  children,
}: GlassOverlayShellProps) {
  const useToolbarChrome = Boolean(toolbar);
  const ariaTitle = title ?? 'Standing';

  return (
    <OverlayDismissProvider accountId={accountId}>
      {({ sheetOpen, requestDismiss, handleSheetClosed }) => (
        <GlassOverlaySheetFrame
          sheetOpen={sheetOpen}
          requestDismiss={requestDismiss}
          handleSheetClosed={handleSheetClosed}
          useToolbarChrome={useToolbarChrome}
          ariaTitle={ariaTitle}
          title={title}
          description={description}
          toolbar={toolbar}
          initialDetent={initialDetent}
          scrollBodyRef={scrollBodyRef}
        >
          {children}
        </GlassOverlaySheetFrame>
      )}
    </OverlayDismissProvider>
  );
}

function GlassOverlaySheetFrame({
  sheetOpen,
  requestDismiss,
  handleSheetClosed,
  useToolbarChrome,
  ariaTitle,
  title,
  description,
  toolbar,
  initialDetent,
  scrollBodyRef,
  children,
}: {
  sheetOpen: boolean;
  requestDismiss: () => void;
  handleSheetClosed: () => void;
  useToolbarChrome: boolean;
  ariaTitle: string;
  title?: string;
  description?: string;
  toolbar?: ReactNode;
  initialDetent: GlassSheetDetent;
  scrollBodyRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  useScrollLock(sheetOpen);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestDismiss}
      onClosed={handleSheetClosed}
      initialDetent={initialDetent}
      tone="os"
      zIndex={50}
      ariaLabelledBy="overlay-title"
      backdropLabel="Close panel"
      bodyRef={scrollBodyRef}
      header={
        <>
          {useToolbarChrome ? (
            <>
              <h2 id="overlay-title" className="sr-only">
                {ariaTitle}
              </h2>
              {toolbar}
            </>
          ) : (
            <>
              <div className="glass-sheet-header">
                <div className="glass-sheet-header-copy">
                  <h2 id="overlay-title" className="glass-sheet-header-title">
                    {title}
                  </h2>
                  {description ? (
                    <p className="glass-sheet-header-subtitle">
                      {description}
                    </p>
                  ) : null}
                </div>
                <SheetCloseButton
                  onClick={requestDismiss}
                  ariaLabel={`Close ${title}`}
                />
              </div>
            </>
          )}
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      {children}
    </GlassSheet>
  );
}
