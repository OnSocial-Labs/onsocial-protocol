'use client';

import type { ReactNode } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';

export function SimpleOverlayPanel({
  ariaTitle,
  title,
  hideTitle = false,
  headerActions,
  children,
}: {
  ariaTitle: string;
  title?: string;
  hideTitle?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <OverlayPanelChrome
        ariaTitle={ariaTitle}
        title={title}
        hideTitle={hideTitle}
        headerActions={headerActions}
      />
      {children}
    </>
  );
}
