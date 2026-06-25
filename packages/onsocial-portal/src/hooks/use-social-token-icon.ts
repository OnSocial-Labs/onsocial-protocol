'use client';

import { useEffect, useState } from 'react';

import { getSocialTokenMetadata } from '@/lib/token-metadata';

export function useSocialTokenIcon(enabled = true): string | null {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIcon(null);
      return;
    }

    let cancelled = false;

    void getSocialTokenMetadata()
      .then((metadata) => {
        if (!cancelled) setIcon(metadata.icon ?? null);
      })
      .catch(() => {
        if (!cancelled) setIcon(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return icon;
}
