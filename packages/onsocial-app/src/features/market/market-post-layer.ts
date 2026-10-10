'use client';

import { useCallback, type MouseEvent } from 'react';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { isAppPostSheetHref } from '@/lib/post-routes';

/** Open a personal or guild post over Market. */
export function useMarketPostLayer(): (href: string) => boolean {
  const { openPostThread } = usePostThreadLayer();
  return useCallback(
    (href: string) => {
      if (!isAppPostSheetHref(href)) return false;
      return openPostThread({ href });
    },
    [openPostThread]
  );
}

export function marketPostLayerLinkHandlers(
  href: string,
  open: (href: string) => boolean,
  beforeOpen?: () => void
): {
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onNavigate: (event: { preventDefault: () => void }) => void;
} {
  return {
    onClick(event) {
      if (!isUnmodifiedPrimaryClick(event)) return;
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      beforeOpen?.();
      open(href);
    },
    onNavigate(event) {
      if (!isAppPostSheetHref(href)) return;
      event.preventDefault();
      beforeOpen?.();
      open(href);
    },
  };
}
