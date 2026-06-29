import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '../../protocol-colors.js';
import {
  buildPageMoodPatch,
  BUILT_IN_PAGE_MOOD_IDS,
  MOOD_PAGE_TYPOGRAPHY,
  PAGE_MOOD_PICKER_SECTIONS,
  mergeMoodIntoPageConfig,
  mergePageMoodTheme,
  moodSurfaceFromAccent,
  MOOD_FONT_STACKS,
  normalizePageMoodId,
  pageMoodPresetForId,
  pageMoodPreviewCssVars,
  pageMoodTypographyFor,
  PAGE_MOOD_PRESETS,
  PREMIUM_PAGE_MOOD_PRESETS,
  resolvePageMoodId,
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

  it('picker sections cover every built-in mood once', () => {
    const fromSections = PAGE_MOOD_PICKER_SECTIONS.flatMap((s) => s.ids);
    expect(fromSections).toEqual([...BUILT_IN_PAGE_MOOD_IDS]);
  });

  it('defines typography for every built-in mood', () => {
    for (const id of BUILT_IN_PAGE_MOOD_IDS) {
      expect(MOOD_PAGE_TYPOGRAPHY[id]).toBeDefined();
      expect(pageMoodTypographyFor(id).fontDisplay).toBeTruthy();
    }
  });

  it('builds build and journal voice typography', () => {
    expect(buildPageMoodPatch('build').theme?.accent).toBe(
      PROTOCOL_COLORS.green
    );
    expect(pageMoodTypographyFor('build').fontDisplay).toBe(
      MOOD_FONT_STACKS.mono
    );
    expect(pageMoodTypographyFor('journal').fontDisplay).toBe(
      MOOD_FONT_STACKS.editorial
    );
    expect(PAGE_MOOD_PRESETS.noir.label).toBe('Noir');
    expect(PAGE_MOOD_PRESETS.journal.tagline).toContain('Longform');
  });

  it('resolves premium summer preset and typography', () => {
    expect(resolvePageMoodId('summer')).toBe('summer');
    expect(pageMoodPresetForId('summer').label).toBe('Summer');
    expect(PREMIUM_PAGE_MOOD_PRESETS.summer.theme.accent).toContain('255');
    expect(pageMoodTypographyFor('summer').fontDisplay).toBe(
      MOOD_FONT_STACKS.sans
    );
  });

  it('exports preset accent vars for css cascade', () => {
    const theme = PAGE_MOOD_PRESETS.protocol.theme;
    expect(pageMoodPreviewCssVars('protocol', theme)).toMatchObject({
      '--mood-preset-accent': PROTOCOL_COLORS.blue,
      '--mood-preset-accent-light': PROTOCOL_COLORS.blue,
    });
  });

  it('splits broadsheet accentLight for editorial ink on light os', () => {
    const theme = PREMIUM_PAGE_MOOD_PRESETS.broadsheet.theme;
    expect(theme.accent).toBe('rgb(82 82 91 / 0.92)');
    expect(theme.accentLight).toBe('rgb(28 28 32 / 0.95)');
    expect(pageMoodPreviewCssVars('broadsheet', theme)).toMatchObject({
      '--mood-preset-accent': 'rgb(82 82 91 / 0.92)',
      '--mood-preset-accent-light': 'rgb(28 28 32 / 0.95)',
    });
  });

  it('pairs voice mood textLight with green ink on light paper', () => {
    const build = PAGE_MOOD_PRESETS.build.theme;
    expect(build.text).toContain('212 251');
    expect(build.textLight).toBe('rgb(42 98 48 / 0.96)');
    expect(build.mutedLight).toBe('rgb(65 105 72 / 0.55)');

    const terminal = PREMIUM_PAGE_MOOD_PRESETS.terminal.theme;
    expect(terminal.text).toContain('57 255 20');
    expect(terminal.textLight).toBe('rgb(32 115 42 / 0.96)');
    expect(terminal.mutedLight).toBe('rgb(50 105 58 / 0.55)');
  });
});
