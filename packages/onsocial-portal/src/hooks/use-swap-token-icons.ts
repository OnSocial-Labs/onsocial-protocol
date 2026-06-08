'use client';

import { useEffect, useState } from 'react';

import { USDC_MAINNET_TOKEN_ID } from '@/lib/portal-swap-config';
import type { PortalSwapInputKind } from '@/lib/portal-swap-config';
import {
  NEAR_TOKEN_DISPLAY,
  fetchFallbackTokenIcon,
  getSocialTokenMetadata,
} from '@/lib/token-metadata';

export function useSwapTokenIcons(enabled: boolean) {
  const [socialIcon, setSocialIcon] = useState<string | null>(null);
  const [usdcIcon, setUsdcIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSocialIcon(null);
      setUsdcIcon(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [social, usdc] = await Promise.all([
        getSocialTokenMetadata()
          .then((metadata) => metadata.icon)
          .catch(() => null),
        fetchFallbackTokenIcon(USDC_MAINNET_TOKEN_ID).catch(() => null),
      ]);

      if (cancelled) return;
      setSocialIcon(social);
      setUsdcIcon(usdc);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const inputIcon = (kind: PortalSwapInputKind): string | null =>
    kind === 'near' ? NEAR_TOKEN_DISPLAY.icon : usdcIcon;

  return {
    nearIcon: NEAR_TOKEN_DISPLAY.icon,
    socialIcon,
    usdcIcon,
    inputIcon,
  };
}
