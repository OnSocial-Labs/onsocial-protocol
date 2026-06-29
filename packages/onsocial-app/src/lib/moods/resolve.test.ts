import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '@onsocial/sdk';
import { MOOD_PRESETS } from './presets';
import { moodDrawerThreadVars, moodPresetPreviewVars, moodSheetItemPreviewVars, resolvePortfolioMood } from './resolve';
import { PREMIUM_MOOD_PRESETS } from './presets';

describe('resolvePortfolioMood', () => {
  it('defaults to protocol when none is set', () => {
    const mood = resolvePortfolioMood({});
    expect(mood.id).toBe('protocol');
    expect(mood.label).toBe('Protocol');
    expect(mood.cssVars['--mood-preset-accent']).toBe(PROTOCOL_COLORS.blue);
    expect(mood.cssVars['--mood-banner']).toContain('gradient');
    expect(mood.cssVars['--mood-preset-bg']).toBe('#050505');
    expect(mood.cssVars['--mood-preset-bg-light']).toBe('#f7faff');
    expect(mood.cssVars['--mood-font-display']).toContain('space-grotesk');
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
    expect(mood.cssVars['--mood-preset-accent']).toContain('255');
    expect(mood.cssVars['--mood-banner']).toContain('gradient');
    expect(mood.cssVars['--mood-surface']).toBeTruthy();
  });
});

describe('moodPresetPreviewVars', () => {
  it('exports swatch vars for mood picker rows', () => {
    const theme = MOOD_PRESETS.creative.theme;
    const preview = moodPresetPreviewVars('creative', theme);
    const mood = resolvePortfolioMood({ mood: { id: 'creative' } });

    expect(preview['--mood-preset-accent']).toBe(mood.cssVars['--mood-preset-accent']);
    expect(preview['--mood-preset-bg']).toBe('#06040a');
    expect(preview['--mood-preset-bg-light']).toBe('#faf5ff');
    expect(preview['--mood-display-weight']).toBe('700');
    expect(preview).not.toHaveProperty('--mood-banner');
  });

  it('includes banner and preset text vars for finish picker rows', () => {
    const theme = PREMIUM_MOOD_PRESETS.glass.theme;
    const preview = moodSheetItemPreviewVars('glass', theme);

    expect(preview['--mood-banner']).toBe(theme.banner);
    expect(preview['--mood-preset-banner-light']).toBe(theme.bannerLight);
    expect(preview['--mood-preset-text']).toBe(theme.text);
    expect(preview['--mood-preset-muted-light']).toBe(theme.mutedLight);
    expect(preview).not.toHaveProperty('--mood-banner-active');
  });

  it('merges custom theme accent into css vars with derived surface', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'protocol' },
      theme: { accent: '#ff00aa' },
    });

    expect(mood.cssVars['--mood-preset-accent']).toBe('#ff00aa');
    expect(mood.cssVars['--mood-surface']).toBe('rgb(255 0 170 / 0.06)');
    expect(mood.cssVars['--mood-preset-bg-light']).toBe('#f7faff');
    expect(mood.cssVars['--mood-signal-standing']).toBe(PROTOCOL_COLORS.blue);
  });

  it('injects mood-harmonized signal vars for lead', () => {
    const mood = resolvePortfolioMood({ mood: { id: 'lead' } });

    expect(mood.cssVars['--mood-signal-reputation']).toMatch(/^rgb\(/);
    expect(mood.cssVars['--mood-signal-standing']).not.toBe(
      mood.cssVars['--mood-preset-accent']
    );
  });

  it('injects voice mood typography for build and journal', () => {
    const build = resolvePortfolioMood({ mood: { id: 'build' } });
    const journal = resolvePortfolioMood({ mood: { id: 'journal' } });

    expect(build.cssVars['--mood-font-display']).toContain('jetbrains-mono');
    expect(build.cssVars['--mood-body-tracking']).toBe('-0.02em');
    expect(journal.cssVars['--mood-font-display']).toContain('newsreader');
    expect(journal.cssVars['--mood-font-body']).toContain('space-grotesk');
    expect(journal.cssVars['--mood-body-leading']).toBe('1.65');
  });

  it('resolves premium summer mood css vars', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'summer' },
      moodUnlocks: { summer: { since: 1 } },
    });

    expect(mood.id).toBe('summer');
    expect(mood.label).toBe('Summer');
    expect(mood.cssVars['--mood-preset-accent']).toContain('255');
    expect(mood.cssVars['--mood-signal-standing']).toMatch(/^rgb\(/);
  });

  it('splits broadsheet accent for dark chrome vs light ink', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'broadsheet' },
      moodUnlocks: { broadsheet: { since: 1 } },
    });

    expect(mood.id).toBe('broadsheet');
    expect(mood.cssVars['--mood-preset-accent']).toBe('rgb(82 82 91 / 0.92)');
    expect(mood.cssVars['--mood-preset-accent-light']).toBe(
      'rgb(28 28 32 / 0.95)'
    );
    expect(mood.cssVars['--mood-font-display']).toContain('newsreader');
    expect(mood.cssVars['--mood-font-body']).toContain('newsreader');
  });

  it('applies the page owner mood typography for any resolved profile', () => {
    const viewerContext = resolvePortfolioMood({
      mood: { id: 'journal' },
      tagline: 'Essays and notes',
    });

    expect(viewerContext.cssVars['--mood-display-weight']).toBe('500');
    expect(viewerContext.cssVars['--mood-bio-max-width']).toBe('22rem');
  });
});

describe('moodDrawerThreadVars', () => {
  it('passes ambient and accent vars without typography', () => {
    const mood = resolvePortfolioMood({ mood: { id: 'creative' } });
    const thread = moodDrawerThreadVars(mood.cssVars);

    expect(thread['--mood-preset-accent']).toBe(mood.cssVars['--mood-preset-accent']);
    expect(thread['--mood-preset-bg']).toBeTruthy();
    expect(thread).not.toHaveProperty('--mood-font-display');
    expect(thread).not.toHaveProperty('--mood-text-preset-mix');
  });
});
