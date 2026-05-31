'use client';

import { useEffect, useState } from 'react';
import { useNavVisibility } from '@/components/providers/nav-visibility-context';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  getDesktopNavMetrics,
  getMobileNavMetrics,
  MOBILE_NAV_MIN_WIDTH,
} from '@/lib/nav-metrics';

/** Sticky `top` offset aligned with the governance rail and mobile nav hide/show. */
export function useNavStickyTop(): string {
  const isMobile = useIsMobile();
  const { navHidden } = useNavVisibility();
  const [viewportWidth, setViewportWidth] = useState(MOBILE_NAV_MIN_WIDTH);

  useEffect(() => {
    const syncViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);

    return () => {
      window.removeEventListener('resize', syncViewportWidth);
    };
  }, []);

  const { topInset: mobileTopInset, height: mobileNavHeight } =
    getMobileNavMetrics(viewportWidth);
  const { railTop: desktopRailTop } = getDesktopNavMetrics();

  if (isMobile) {
    return navHidden
      ? `${mobileTopInset}px`
      : `${mobileTopInset + mobileNavHeight + mobileTopInset}px`;
  }

  return `${desktopRailTop}px`;
}
