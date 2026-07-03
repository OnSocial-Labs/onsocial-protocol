import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '@onsocial/sdk';
import { MOOD_PRESETS } from './presets';
import { moodDrawerThreadVars, moodPresetPreviewVars, moodSheetItemPreviewVars, moodSheetPanelStyle, moodSheetRowInlineStyle, moodSheetRowPreviewVars, pageContentDrawerPanelStyle, portfolioMoodShellStyle, resolvePortfolioMood, resolvePortfolioMoodForId, resolvePortfolioMoodForPreview } from './resolve';
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
    expect(mood.cssVars['--mood-font-display']).toContain('erica-type');
    expect(mood.cssVars['--mood-font-body']).toContain('erica-type');
  });

  it('applies the page owner mood typography for any resolved profile', () => {
    const viewerContext = resolvePortfolioMood({
      mood: { id: 'journal' },
      tagline: 'Essays and notes',
    });

    expect(viewerContext.cssVars['--mood-display-weight']).toBe('500');
    expect(viewerContext.cssVars['--mood-bio-max-width']).toBe('22rem');
  });

  it('applies stored signature ink hue when signature mood is active', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'signature' },
      theme: { moodTints: { signature: 300 } },
    });

    expect(mood.cssVars['--mood-preset-accent']).not.toBe(
      'rgb(56 189 248 / 0.95)'
    );
    expect(mood.cssVars['--mood-preset-muted']).not.toBe(
      'rgb(160 210 230 / 0.48)'
    );
    expect(mood.cssVars['--mood-banner']).toContain('gradient');
  });

  it('ignores signature tint when another mood is active', () => {
    const mood = resolvePortfolioMood({
      mood: { id: 'protocol' },
      theme: { moodTints: { signature: 300 } },
    });

    expect(mood.id).toBe('protocol');
    expect(mood.cssVars['--mood-preset-accent']).toBe(PROTOCOL_COLORS.blue);
  });

  it('applies stored signature ink in mood picker row preview', () => {
    const preset = PREMIUM_MOOD_PRESETS.signature.theme;
    const catalogAccent = preset.accent;
    const preview = moodSheetRowPreviewVars('signature', preset, {
      moodTints: { signature: 300 },
    });

    expect(preview['--mood-preset-accent']).not.toBe(catalogAccent);
    expect(preview['--mood-banner']).toContain('gradient');
  });

  it('leaves protocol picker preview on preset when signature tint is stored', () => {
    const preset = MOOD_PRESETS.protocol.theme;
    const preview = moodSheetRowPreviewVars('protocol', preset, {
      moodTints: { signature: 300 },
    });

    expect(preview['--mood-preset-accent']).toBe(preset.accent);
  });

  it('sets concrete row accent vars for mood picker inline styles', () => {
    const lead = moodSheetRowInlineStyle(
      moodSheetRowPreviewVars('lead', MOOD_PRESETS.lead.theme)
    );
    const creative = moodSheetRowInlineStyle(
      moodSheetRowPreviewVars('creative', MOOD_PRESETS.creative.theme)
    );

    expect(lead['--mood-row-accent']).toBe(MOOD_PRESETS.lead.theme.accent);
    expect(creative['--mood-row-accent']).toBe(MOOD_PRESETS.creative.theme.accent);
    expect(lead['--mood-row-accent']).not.toBe(creative['--mood-row-accent']);
  });

  it('picker rows ignore global page theme accent wash', () => {
    const pageTheme = {
      accent: PROTOCOL_COLORS.blue,
      primary: PROTOCOL_COLORS.blue,
    };
    const lead = moodSheetRowPreviewVars('lead', MOOD_PRESETS.lead.theme, pageTheme);
    const creative = moodSheetRowPreviewVars(
      'creative',
      MOOD_PRESETS.creative.theme,
      pageTheme
    );

    expect(lead['--mood-preset-accent']).toBe(MOOD_PRESETS.lead.theme.accent);
    expect(creative['--mood-preset-accent']).toBe(
      MOOD_PRESETS.creative.theme.accent
    );
  });

  it('panel thread omits accent vars so rows do not inherit active mood ink', () => {
    const mood = resolvePortfolioMood({ mood: { id: 'protocol' } });
    const panel = moodSheetPanelStyle(mood.cssVars);

    expect(panel['--mood-preset-accent']).toBeUndefined();
    expect(panel['--mood-preset-bg']).toBe(mood.cssVars['--mood-preset-bg']);
  });

  it('preview resolve keeps catalog accents when page theme accent is set', () => {
    const pageTheme = {
      accent: PROTOCOL_COLORS.blue,
      primary: PROTOCOL_COLORS.blue,
    };
    const preview = resolvePortfolioMoodForPreview(
      { mood: { id: 'protocol' }, theme: pageTheme },
      'lead'
    );

    expect(preview.cssVars['--mood-preset-accent']).toBe(
      MOOD_PRESETS.lead.theme.accent
    );
    expect(preview.cssVars['--mood-preset-accent']).not.toBe(
      PROTOCOL_COLORS.blue
    );
  });

  it('shell style sets concrete accent vars for preview frames', () => {
    const lead = resolvePortfolioMoodForPreview({ mood: { id: 'protocol' } }, 'lead');
    const creative = resolvePortfolioMoodForPreview(
      { mood: { id: 'protocol' } },
      'creative'
    );
    const leadShell = portfolioMoodShellStyle(lead.cssVars, { preview: true });
    const creativeShell = portfolioMoodShellStyle(creative.cssVars, {
      preview: true,
    });

    expect(leadShell['--mood-accent']).toBe(MOOD_PRESETS.lead.theme.accent);
    expect(creativeShell['--mood-accent']).toBe(MOOD_PRESETS.creative.theme.accent);
    expect(leadShell['--mood-bg-preset-mix']).toBe('72%');
    expect(leadShell['--mood-banner-active']).toContain('gradient');
  });
});

describe('resolvePortfolioMoodForId', () => {
  it('resolves preview mood from config without stored mood record', () => {
    const mood = resolvePortfolioMoodForId(
      { mood: { id: 'protocol' }, theme: { moodTints: { signature: 300 } } },
      'signature'
    );

    expect(mood.id).toBe('signature');
    expect(mood.label).toBe(PREMIUM_MOOD_PRESETS.signature.label);
    expect(mood.cssVars['--mood-preset-accent']).not.toBe(
      PREMIUM_MOOD_PRESETS.signature.theme.accent
    );
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

describe('pageContentDrawerPanelStyle', () => {
  it('threads ambient vars and concrete accent chrome for the grip', () => {
    const mood = resolvePortfolioMood({ mood: { id: 'terminal' } });
    const panel = pageContentDrawerPanelStyle(mood.cssVars);

    expect(panel['--mood-preset-bg']).toBeTruthy();
    expect(panel['--mood-preset-accent']).toBe(mood.cssVars['--mood-preset-accent']);
    expect(panel['--mood-accent-chrome']).toBe(mood.cssVars['--mood-preset-accent']);
  });
});
