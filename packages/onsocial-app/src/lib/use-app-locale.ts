'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { LOCALE_EVENT, readLocale, type AppLocale } from '@/lib/locale';

/**
 * Stay on English for the hydration pass. The stored choice applies on the
 * next paint, so server HTML and the first client render match.
 */
let clientReady = false;

function subscribe(onChange: () => void) {
  window.addEventListener(LOCALE_EVENT, onChange);
  return () => window.removeEventListener(LOCALE_EVENT, onChange);
}

function snapshot(): AppLocale {
  if (!clientReady) return 'en';
  return readLocale();
}

export function useAppLocale(): AppLocale {
  const locale = useSyncExternalStore<AppLocale>(
    subscribe,
    snapshot,
    () => 'en'
  );

  useEffect(() => {
    if (clientReady) return;
    clientReady = true;
    window.dispatchEvent(new Event(LOCALE_EVENT));
  }, []);

  return locale;
}
