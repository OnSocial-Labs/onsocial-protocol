'use client';

import type { ReactNode } from 'react';
import { OverlayPanelChrome } from '@/components/overlay/overlay-panel-chrome';

export function SimpleOverlayPanel({
  ariaTitle,
  title,
  children,
}: {
  ariaTitle: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <OverlayPanelChrome ariaTitle={ariaTitle} title={title} />
      {children}
    </>
  );
}