'use client';

import { useEffect, useState } from 'react';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

/** Local brand mark when chain metadata is slow or unavailable. */
export const SOCIAL_TOKEN_ICON_FALLBACK = '/onsocial_icon.svg';

let cachedSocialIcon: string | null | undefined;

/**
 * SOCIAL NEP-148 icon from gateway `ft_metadata` (session-cached).
 * Falls back to the app brand mark if metadata has no icon.
 */
export function useSocialTokenIcon(enabled = true): string | null {
  const [icon, setIcon] = useState<string | null>(
    () => cachedSocialIcon ?? SOCIAL_TOKEN_ICON_FALLBACK
  );

  useEffect(() => {
    if (!enabled) {
      setIcon(null);
      return;
    }

    if (cachedSocialIcon !== undefined) {
      setIcon(cachedSocialIcon || SOCIAL_TOKEN_ICON_FALLBACK);
      return;
    }

    let cancelled = false;
    const os = createReadOnlyOnSocialClient();

    void os.token
      .metadata()
      .then((metadata) => {
        const next = metadata.icon?.trim() || SOCIAL_TOKEN_ICON_FALLBACK;
        cachedSocialIcon = next;
        if (!cancelled) setIcon(next);
      })
      .catch(() => {
        cachedSocialIcon = SOCIAL_TOKEN_ICON_FALLBACK;
        if (!cancelled) setIcon(SOCIAL_TOKEN_ICON_FALLBACK);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return icon;
}
