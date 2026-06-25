import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '@onsocial/sdk';
import { MOOD_PRESETS } from './presets';
import { moodPresetPreviewVars, resolvePortfolioMood } from './resolve';

describe('resolvePortfolioMood', () => {
  it('defaults to protocol when none is set', () => {
    const mood = resolvePortfolioMood({});
    expect(mood.id).toBe('protocol');
    expect(mood.label).toBe('Protocol');
    expect(mood.cssVars['--mood-accent']).toBe(PROTOCOL_COLORS.blue);
    expect(mood.cssVars['--mood-banner']).toContain('gradient');
    expect(mood.cssVars['--mood-preset-bg']).toBe('#050505');
    expect(mood.cssVars['--mood-preset-bg-light']).toBe('#f7faff');
  });

  it('maps legacy default mood id to protocol', () => {
    const mood = resolvePortfolioMood({ mood: { id: 'default' } });
    expect(mood.id).toBe('protocol');
    expect(mood.label).toBe('Protocol');
  });

  it('resolves a stored celebration mood with note and accent css vars', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'celebration', since: 1_700_000_000_000, note: 'just shipped' },
    });
    expect(mood.id).toBe('celebration');
    expect(mood.label).toBe('Celebration');
    expect(mood.note).toBe('just shipped');
    expect(mood.cssVars['--mood-accent']).toContain('255');
    expect(mood.cssVars['--mood-banner']).toContain('gradient');
    expect(mood.cssVars['--mood-surface']).toBeTruthy();
  });
});

describe('moodPresetPreviewVars', () => {
  it('exports swatch vars for mood picker rows', () => {
    const theme = MOOD_PRESETS.creative.theme;
    const preview = moodPresetPreviewVars(theme);
    const mood = resolvePortfolioMood({ mood: { id: 'creative' } });

    expect(preview['--mood-accent']).toBe(mood.cssVars['--mood-accent']);
    expect(preview['--mood-preset-bg']).toBe('#06040a');
    expect(preview['--mood-preset-bg-light']).toBe('#faf5ff');
    expect(preview).not.toHaveProperty('--mood-banner');
  });

  it('merges custom theme accent into css vars with derived surface', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'protocol' },
      theme: { accent: '#ff00aa' },
    });

    expect(mood.cssVars['--mood-accent']).toBe('#ff00aa');
    expect(mood.cssVars['--mood-surface']).toBe('rgb(255 0 170 / 0.06)');
    expect(mood.cssVars['--mood-preset-bg-light']).toBe('#f7faff');
  });
});
