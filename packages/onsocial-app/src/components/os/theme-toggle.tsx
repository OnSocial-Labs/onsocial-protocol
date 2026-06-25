'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY } from '@/lib/theme-init';

type ThemeChoice = 'light' | 'dark';

const THEME_EVENT = 'onsocial:themechange';

function readTheme(): ThemeChoice {
  if (typeof document === 'undefined') {
    return 'dark';
  }
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') {
    return attr;
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  const media = window.matchMedia('(prefers-color-scheme: light)');
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener('change', onChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<ThemeChoice>(
    subscribe,
    readTheme,
    () => 'dark'
  );

  const apply = useCallback((next: ThemeChoice) => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore persistence failures
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button
        type="button"
        className={`theme-toggle-option${theme === 'light' ? ' is-active' : ''}`}
        aria-pressed={theme === 'light'}
        onClick={() => apply('light')}
      >
        Light
      </button>
      <button
        type="button"
        className={`theme-toggle-option${theme === 'dark' ? ' is-active' : ''}`}
        aria-pressed={theme === 'dark'}
        onClick={() => apply('dark')}
      >
        Dark
      </button>
    </div>
  );
}
