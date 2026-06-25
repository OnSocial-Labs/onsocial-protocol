import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '../../protocol-colors.js';
import {
  buildPageMoodPatch,
  mergeMoodIntoPageConfig,
  mergePageMoodTheme,
  moodSurfaceFromAccent,
  normalizePageMoodId,
  pageMoodPresetForId,
  PAGE_MOOD_PRESETS,
} from './moods.js';

describe('page moods', () => {
  it('builds a protocol mood patch with theme tokens', () => {
    const patch = buildPageMoodPatch('protocol', { now: 100 });

    expect(patch.mood).toEqual({ id: 'protocol', since: 100 });
    expect(patch.theme?.background).toBe('#050505');
    expect(patch.theme?.accent).toBe(PROTOCOL_COLORS.blue);
  });

  it('normalizes legacy default id to protocol preset', () => {
    expect(normalizePageMoodId('default')).toBe('protocol');
    expect(pageMoodPresetForId('default').id).toBe('protocol');
  });

  it('builds a celebration mood patch with theme tokens', () => {
    const patch = buildPageMoodPatch('celebration', {
      note: 'just shipped',
      now: 123,
    });

    expect(patch.mood).toEqual({
      id: 'celebration',
      since: 123,
      note: 'just shipped',
    });
    expect(patch.theme?.background).toBe('#0a0508');
    expect(patch.theme?.accent).toContain('255');
  });

  it('merges mood into existing page config', () => {
    const next = mergeMoodIntoPageConfig(
      { tagline: 'Builder', sections: ['profile'] },
      'lead'
    );

    expect(next.tagline).toBe('Builder');
    expect(next.sections).toEqual(['profile']);
    expect(next.mood?.id).toBe('lead');
    expect(next.theme?.background).toBe('#070605');
  });

  it('derives surface tint from hex accent', () => {
    expect(moodSurfaceFromAccent('#60a5fa')).toBe('rgb(96 165 250 / 0.06)');
  });

  it('merges on-chain theme overrides onto preset tokens', () => {
    const preset = PAGE_MOOD_PRESETS.protocol.theme;
    const merged = mergePageMoodTheme(preset, {
      accent: '#ff00aa',
      background: '#101010',
    });

    expect(merged.accent).toBe('#ff00aa');
    expect(merged.background).toBe('#101010');
    expect(merged.surface).toBe('rgb(255 0 170 / 0.06)');
    expect(merged.backgroundLight).toBe(preset.backgroundLight);
    expect(merged.bannerLight).toBe(preset.bannerLight);
  });
});
