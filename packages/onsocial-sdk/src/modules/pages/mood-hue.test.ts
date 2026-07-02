import { describe, expect, it } from 'vitest';
import {
  accentFromHue,
  accentHueFromColor,
  effectiveMoodTintHue,
  mergePageMoodTintIntoPageConfig,
  normalizeMoodHue,
  resolveMoodTintHue,
} from './mood-hue.js';
import {
  mergeMoodIntoPageConfig,
  mergePageMoodTheme,
  PAGE_MOOD_PRESETS,
  PREMIUM_PAGE_MOOD_PRESETS,
} from './moods.js';

describe('mood hue', () => {
  it('normalizes hue to 0–359', () => {
    expect(normalizeMoodHue(370)).toBe(10);
    expect(normalizeMoodHue(-10)).toBe(350);
  });

  it('derives accent hue from preset rgb', () => {
    const hue = accentHueFromColor(
      PREMIUM_PAGE_MOOD_PRESETS.signature.theme.accent
    );
    expect(hue).not.toBeNull();
    expect(hue!).toBeGreaterThan(180);
    expect(hue!).toBeLessThan(220);
  });

  it('shifts accent while preserving alpha', () => {
    const shifted = accentFromHue(
      320,
      PREMIUM_PAGE_MOOD_PRESETS.signature.theme.accent
    );
    expect(shifted).toMatch(/^rgb\(\d+ \d+ \d+ \/ 0\.95\)$/);
    expect(shifted).not.toBe(PREMIUM_PAGE_MOOD_PRESETS.signature.theme.accent);
  });

  it('persists mood tint on page config', () => {
    const next = mergePageMoodTintIntoPageConfig(
      { tagline: 'Hello' },
      'signature',
      210
    );
    expect(next.tagline).toBe('Hello');
    expect(next.theme?.moodTints?.signature).toBe(210);
  });

  it('reads stored tint for active mood only', () => {
    expect(
      resolveMoodTintHue('signature', { moodTints: { signature: 210 } })
    ).toBe(210);
    expect(
      resolveMoodTintHue('protocol', { moodTints: { signature: 210 } })
    ).toBeNull();
  });

  it('applies stored tint when signature mood is active', () => {
    const preset = PREMIUM_PAGE_MOOD_PRESETS.signature.theme;
    const merged = mergePageMoodTheme(
      preset,
      { moodTints: { signature: 300 } },
      'signature'
    );

    expect(merged.accent).not.toBe(preset.accent);
    expect(merged.muted).not.toBe(preset.muted);
    expect(merged.banner).toContain('gradient');
    expect(merged.surface).not.toBe(preset.surface);
  });

  it('preserves mood tints when switching moods', () => {
    const next = mergeMoodIntoPageConfig(
      {
        theme: { moodTints: { signature: 210 } },
      },
      'protocol'
    );

    expect(next.mood?.id).toBe('protocol');
    expect(next.theme?.moodTints?.signature).toBe(210);
    expect(next.theme?.accent).toBe(PAGE_MOOD_PRESETS.protocol.theme.accent);
  });

  it('re-applies signature tint after switching back', () => {
    const afterSwitch = mergeMoodIntoPageConfig(
      {
        theme: { moodTints: { signature: 210 } },
        mood: { id: 'protocol', since: 1 },
      },
      'signature'
    );

    const merged = mergePageMoodTheme(
      PREMIUM_PAGE_MOOD_PRESETS.signature.theme,
      afterSwitch.theme,
      'signature'
    );

    expect(afterSwitch.mood?.id).toBe('signature');
    expect(afterSwitch.theme?.moodTints?.signature).toBe(210);
    expect(merged.accent).toBe(
      accentFromHue(210, PREMIUM_PAGE_MOOD_PRESETS.signature.theme.accent)
    );
  });

  it('falls back to preset hue when no tint is stored', () => {
    const presetAccent = PREMIUM_PAGE_MOOD_PRESETS.signature.theme.accent;
    expect(effectiveMoodTintHue('signature', undefined, presetAccent)).toBe(
      accentHueFromColor(presetAccent)
    );
  });
});
