import type { PageMoodId } from './modules/pages/moods.js';
import { PROTOCOL_COLORS } from './protocol-colors.js';

/** Canonical profile signal hues — keep aligned with `@onsocial/ui/protocol.css` `--signal-*`. */
export const PROTOCOL_SIGNAL_COLORS = {
  standing: PROTOCOL_COLORS.blue,
  solidarity: PROTOCOL_COLORS.purple,
  /** Endorse gold — dark-surface token from protocol.css. */
  endorse: '#dab872',
  reputation: PROTOCOL_COLORS.green,
} as const;

export type PageMoodSignalTokenKey = keyof typeof PROTOCOL_SIGNAL_COLORS;

export interface PageMoodSignalTokens {
  standing: string;
  solidarity: string;
  endorse: string;
  reputation: string;
}

/**
 * Protocol share (0–1) per signal when blending with mood accent.
 * Lower = stronger mood connection; standing keeps the highest share so blue identity holds.
 */
export const MOOD_SIGNAL_PROTOCOL_WEIGHT: Record<
  PageMoodId,
  Record<PageMoodSignalTokenKey, number>
> = {
  protocol: { standing: 1, solidarity: 1, endorse: 1, reputation: 1 },
  lead: { standing: 0.54, solidarity: 0.4, endorse: 0.22, reputation: 0.3 },
  business: {
    standing: 0.58,
    solidarity: 0.4,
    endorse: 0.36,
    reputation: 0.34,
  },
  creative: {
    standing: 0.52,
    solidarity: 0.3,
    endorse: 0.32,
    reputation: 0.34,
  },
  celebration: {
    standing: 0.5,
    solidarity: 0.32,
    endorse: 0.26,
    reputation: 0.28,
  },
  noir: { standing: 0.6, solidarity: 0.44, endorse: 0.4, reputation: 0.38 },
  build: { standing: 0.5, solidarity: 0.36, endorse: 0.3, reputation: 0.38 },
  journal: {
    standing: 0.56,
    solidarity: 0.42,
    endorse: 0.4,
    reputation: 0.36,
  },
  summer: {
    standing: 0.5,
    solidarity: 0.3,
    endorse: 0.24,
    reputation: 0.3,
  },
  gold: { standing: 0.52, solidarity: 0.38, endorse: 0.2, reputation: 0.28 },
  glass: {
    standing: 0.58,
    solidarity: 0.4,
    endorse: 0.36,
    reputation: 0.34,
  },
  carbon: { standing: 0.6, solidarity: 0.44, endorse: 0.4, reputation: 0.38 },
  holographic: {
    standing: 0.5,
    solidarity: 0.28,
    endorse: 0.3,
    reputation: 0.32,
  },
  broadsheet: {
    standing: 0.56,
    solidarity: 0.42,
    endorse: 0.4,
    reputation: 0.36,
  },
  terminal: {
    standing: 0.48,
    solidarity: 0.34,
    endorse: 0.28,
    reputation: 0.36,
  },
  signature: {
    standing: 0.72,
    solidarity: 0.62,
    endorse: 0.52,
    reputation: 0.58,
  },
};

type Rgb = readonly [number, number, number];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Parse `#rgb`, `#rrggbb`, or `rgb(r g b / a)` into sRGB bytes. */
export function parseColorToRgb(color: string): Rgb | null {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    if (raw.length === 3) {
      return [
        Number.parseInt(raw[0] + raw[0], 16),
        Number.parseInt(raw[1] + raw[1], 16),
        Number.parseInt(raw[2] + raw[2], 16),
      ];
    }
    return [
      Number.parseInt(raw.slice(0, 2), 16),
      Number.parseInt(raw.slice(2, 4), 16),
      Number.parseInt(raw.slice(4, 6), 16),
    ];
  }

  const rgb = color.match(
    /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.]+)?\s*\)$/i
  );
  if (rgb) {
    return [
      Number.parseInt(rgb[1], 10),
      Number.parseInt(rgb[2], 10),
      Number.parseInt(rgb[3], 10),
    ];
  }

  return null;
}

/** Linear sRGB blend; `protocolWeight` is the share of `protocolColor`. */
export function blendProtocolSignalWithMood(
  protocolColor: string,
  moodAccent: string,
  protocolWeight: number
): string {
  const weight = Math.max(0, Math.min(1, protocolWeight));
  const protocolRgb = parseColorToRgb(protocolColor);
  const moodRgb = parseColorToRgb(moodAccent);

  if (!protocolRgb || !moodRgb) {
    return weight >= 1 ? protocolColor : moodAccent;
  }

  if (weight >= 1) {
    return protocolColor;
  }
  if (weight <= 0) {
    return moodAccent;
  }

  const moodWeight = 1 - weight;
  const r = clampByte(protocolRgb[0] * weight + moodRgb[0] * moodWeight);
  const g = clampByte(protocolRgb[1] * weight + moodRgb[1] * moodWeight);
  const b = clampByte(protocolRgb[2] * weight + moodRgb[2] * moodWeight);

  return `rgb(${r} ${g} ${b} / 0.95)`;
}

export function pageMoodSignalsFor(
  moodId: PageMoodId,
  accent: string
): PageMoodSignalTokens {
  const weights = MOOD_SIGNAL_PROTOCOL_WEIGHT[moodId];

  return {
    standing: blendProtocolSignalWithMood(
      PROTOCOL_SIGNAL_COLORS.standing,
      accent,
      weights.standing
    ),
    solidarity: blendProtocolSignalWithMood(
      PROTOCOL_SIGNAL_COLORS.solidarity,
      accent,
      weights.solidarity
    ),
    endorse: blendProtocolSignalWithMood(
      PROTOCOL_SIGNAL_COLORS.endorse,
      accent,
      weights.endorse
    ),
    reputation: blendProtocolSignalWithMood(
      PROTOCOL_SIGNAL_COLORS.reputation,
      accent,
      weights.reputation
    ),
  };
}

export function moodSignalTokensToCssVars(
  signals: PageMoodSignalTokens
): Record<string, string> {
  return {
    '--mood-signal-standing': signals.standing,
    '--mood-signal-solidarity': signals.solidarity,
    '--mood-signal-endorse': signals.endorse,
    '--mood-signal-reputation': signals.reputation,
  };
}
