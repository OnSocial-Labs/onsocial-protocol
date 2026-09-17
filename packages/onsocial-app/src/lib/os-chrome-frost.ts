import type { CSSProperties } from 'react';

/**
 * Elevated OS header / `.os-chrome-glass` frost — single source of truth.
 * Dock pill fill is different (`--glass-surface` ~0.32); do not reuse this for dock.
 */
export const OS_CHROME_FROST_FILTER = 'blur(20px) saturate(1.3)';
export const OS_CHROME_FROST_FILL = 'rgb(var(--bg-rgb) / 0.72)';

/** Inline so Lightning cannot drop `backdrop-filter` from a stylesheet pair. */
export function osChromeFrostStyle(
  extras?: CSSProperties
): CSSProperties {
  return {
    background: OS_CHROME_FROST_FILL,
    backdropFilter: OS_CHROME_FROST_FILTER,
    WebkitBackdropFilter: OS_CHROME_FROST_FILTER,
    ...extras,
  };
}
