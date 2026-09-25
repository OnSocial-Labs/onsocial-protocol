'use client';

import { useCallback, type MouseEvent } from 'react';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { isInAppPostLayerHref } from '@/lib/post-routes';

/** Open a personal post over Market. Guild threads stay a real page. */
export function useMarketPostLayer(): (href: string) => boolean {
  const { openPostThread } = usePostThreadLayer();
  return useCallback(
    (href: string) => {
      if (!isInAppPostLayerHref(href)) return false;
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
      if (!isInAppPostLayerHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      beforeOpen?.();
      open(href);
    },
    onNavigate(event) {
      if (!isInAppPostLayerHref(href)) return;
      event.preventDefault();
      beforeOpen?.();
      open(href);
    },
  };
}
