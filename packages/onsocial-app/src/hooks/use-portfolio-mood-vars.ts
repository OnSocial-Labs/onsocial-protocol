'use client';

import { useCallback, useSyncExternalStore, type CSSProperties } from 'react';
import { accountIdsEqual } from '@/lib/account-match';
import type { MoodId } from '@/lib/moods/types';

const PORTFOLIO_FRAME_SELECTOR =
  '.portfolio-frame[data-mood], .portfolio-os-layer[data-mood]';

const MOOD_CSS_VARS = [
  '--mood-bg',
  '--mood-text',
  '--mood-muted',
  '--mood-accent',
  '--mood-accent-chrome',
  '--mood-preset-bg',
  '--mood-preset-bg-light',
  '--mood-preset-accent',
  '--mood-preset-accent-light',
  '--portfolio-avatar-ring',
  '--mood-font-display',
  '--mood-display-weight',
  '--mood-display-tracking',
  '--glass-card-glint',
  /* Bio tokens (# / @ / $ / links) — same signal hues as the live portfolio. */
  '--mood-signal-standing',
  '--mood-signal-solidarity',
  '--mood-signal-endorse',
  '--mood-signal-reputation',
  '--signal-standing',
  '--signal-solidarity',
  '--signal-endorse',
  '--signal-reputation',
] as const;

export type PortfolioMoodVarsSnapshot = {
  moodId: MoodId | null;
  style: CSSProperties | undefined;
};

const DISABLED_SNAPSHOT: PortfolioMoodVarsSnapshot = {
  moodId: null,
  style: undefined,
};

let cachedSnapshot: PortfolioMoodVarsSnapshot = DISABLED_SNAPSHOT;
let cachedSnapshotKey = 'disabled';

function getPortfolioMoodId(): MoodId | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    (document
      .querySelector(PORTFOLIO_FRAME_SELECTOR)
      ?.getAttribute('data-mood') as MoodId | null) ?? null
  );
}

function readPortfolioMoodStyle(): CSSProperties | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const frame = document.querySelector(PORTFOLIO_FRAME_SELECTOR);
  if (!frame) {
    return undefined;
  }

  const computed = getComputedStyle(frame);
  const vars: Record<string, string> = {};

  for (const name of MOOD_CSS_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) {
      vars[name] = value;
    }
  }

  if (getPortfolioMoodId() === 'glass') {
    vars['--account-editor-avatar-ring'] = computed
      .getPropertyValue('--bg')
      .trim();

    const osLayer = document.querySelector('.portfolio-os-layer[data-mood]');
    if (osLayer) {
      const summonGrip = getComputedStyle(osLayer)
        .getPropertyValue('--glass-summon-grip')
        .trim();
      if (summonGrip) {
        vars['--glass-summon-grip'] = summonGrip;
      }
    }
  }

  return Object.keys(vars).length > 0 ? (vars as CSSProperties) : undefined;
}

function readPortfolioMoodSnapshot(): PortfolioMoodVarsSnapshot {
  const moodId = getPortfolioMoodId();
  const style = readPortfolioMoodStyle();
  const styleKey = style ? JSON.stringify(style) : '';
  const key = `${moodId ?? ''}|${styleKey}`;

  if (key === cachedSnapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshotKey = key;
  cachedSnapshot = { moodId, style };
  return cachedSnapshot;
}

function subscribePortfolioMood(onStoreChange: () => void) {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-mood', 'style', 'class'],
    childList: true,
  });

  return () => observer.disconnect();
}

/** Mood tint from the live portfolio shell — for editor parity when editing on-page. */
export function usePortfolioMoodVars(
  pageAccountId: string | undefined,
  walletAccountId: string,
  enabled: boolean
): PortfolioMoodVarsSnapshot {
  const shouldRead =
    enabled &&
    Boolean(pageAccountId) &&
    Boolean(walletAccountId) &&
    accountIdsEqual(pageAccountId!, walletAccountId);

  const getSnapshot = useCallback(() => {
    if (!shouldRead) {
      return DISABLED_SNAPSHOT;
    }

    return readPortfolioMoodSnapshot();
  }, [shouldRead]);

  return useSyncExternalStore(
    subscribePortfolioMood,
    getSnapshot,
    () => DISABLED_SNAPSHOT
  );
}
