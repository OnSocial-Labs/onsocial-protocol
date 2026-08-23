'use client';

import type { ReactNode } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';

export function SimpleOverlayPanel({
  ariaTitle,
  title,
  headerActions,
  children,
}: {
  ariaTitle: string;
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <OverlayPanelChrome
        ariaTitle={ariaTitle}
        title={title}
        headerActions={headerActions}
      />
      {children}
    </>
  );
}