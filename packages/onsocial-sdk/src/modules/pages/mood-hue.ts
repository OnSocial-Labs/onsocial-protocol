import type { PageConfig, PageTheme } from '../../types.js';
import type { PageMoodId } from './moods.js';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export function normalizeMoodHue(hue: number): number {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function parseAccentRgb(accent: string): RgbColor | null {
  const rgb = accent.match(
    /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/i
  );
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      alpha: rgb[4] ? Number(rgb[4]) : 1,
    };
  }

  const hex = accent.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (!hex) {
    return null;
  }

  const raw = hex[1];
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
    alpha: 1,
  };
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number
): {
  h: number;
  s: number;
  l: number;
} {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h = 0;

  if (max === rn) {
    h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / delta + 2) * 60;
  } else {
    h = ((rn - gn) / delta + 4) * 60;
  }

  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hue = normalizeMoodHue(h) / 360;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray, alpha: 1 };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const hueToChannel = (t: number) => {
    let channel = t;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  };

  return {
    r: Math.round(hueToChannel(hue + 1 / 3) * 255),
    g: Math.round(hueToChannel(hue) * 255),
    b: Math.round(hueToChannel(hue - 1 / 3) * 255),
    alpha: 1,
  };
}

export function formatAccentRgb(color: RgbColor): string {
  if (color.alpha >= 1) {
    return `rgb(${color.r} ${color.g} ${color.b})`;
  }

  return `rgb(${color.r} ${color.g} ${color.b} / ${color.alpha})`;
}

export function accentHueFromColor(accent: string): number | null {
  const parsed = parseAccentRgb(accent);
  if (!parsed) {
    return null;
  }

  return normalizeMoodHue(rgbToHsl(parsed.r, parsed.g, parsed.b).h);
}

export function accentFromHue(hue: number, referenceAccent: string): string {
  const parsed = parseAccentRgb(referenceAccent);
  if (!parsed) {
    return referenceAccent;
  }

  const { s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const shifted = hslToRgb(hue, s, l);
  return formatAccentRgb({ ...shifted, alpha: parsed.alpha });
}

export function moodMutedFromAccent(accent: string, alpha = 0.48): string {
  const parsed = parseAccentRgb(accent);
  if (!parsed) {
    return accent;
  }

  const { h, s } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const muted = hslToRgb(h, Math.min(s * 0.72, 0.58), 0.72);
  return formatAccentRgb({ ...muted, alpha });
}

export function moodBannerFromAccent(accent: string): {
  banner: string;
  bannerLight: string;
} {
  const parsed = parseAccentRgb(accent);
  if (!parsed) {
    return { banner: 'transparent', bannerLight: 'transparent' };
  }

  const { r, g, b } = parsed;
  return {
    banner: `radial-gradient(ellipse 85% 68% at 18% -8%, rgb(${r} ${g} ${b} / 0.2), transparent 56%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(${r} ${g} ${b} / 0.12), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(${r} ${g} ${b} / 0.08), transparent 62%)`,
    bannerLight: `radial-gradient(ellipse 85% 68% at 18% -8%, rgb(${r} ${g} ${b} / 0.14), transparent 56%), radial-gradient(ellipse 75% 55% at 82% 12%, rgb(${r} ${g} ${b} / 0.08), transparent 52%), radial-gradient(ellipse 90% 60% at 50% 100%, rgb(${r} ${g} ${b} / 0.05), transparent 62%)`,
  };
}

export function resolveMoodTintHue(
  moodId: PageMoodId,
  theme?: PageTheme
): number | null {
  const hue = theme?.moodTints?.[moodId];
  if (typeof hue !== 'number' || !Number.isFinite(hue)) {
    return null;
  }

  return normalizeMoodHue(hue);
}

export function effectiveMoodTintHue(
  moodId: PageMoodId,
  theme: PageTheme | undefined,
  presetAccent: string
): number {
  return (
    resolveMoodTintHue(moodId, theme) ?? accentHueFromColor(presetAccent) ?? 199
  );
}

export function mergePageMoodTintIntoPageConfig(
  current: PageConfig,
  moodId: PageMoodId,
  hue: number
): PageConfig {
  return {
    ...current,
    theme: {
      ...current.theme,
      moodTints: {
        ...current.theme?.moodTints,
        [moodId]: normalizeMoodHue(hue),
      },
    },
  };
}
