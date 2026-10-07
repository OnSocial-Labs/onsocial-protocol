import { describe, expect, it } from 'vitest';
import { PROTOCOL_COLORS } from '../../protocol-colors.js';
import {
  buildPageMoodPatch,
  BUILT_IN_PAGE_MOOD_IDS,
  MOOD_PAGE_TYPOGRAPHY,
  PAGE_MOOD_PICKER_SECTIONS,
  mergeMoodIntoPageConfig,
  mergePageMoodTheme,
  mergePageMoodThemeForPicker,
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

  it('picker merge keeps catalog accents when page theme accent is set', () => {
    const pageTheme = {
      accent: PROTOCOL_COLORS.blue,
      primary: PROTOCOL_COLORS.blue,
    };

    const lead = mergePageMoodThemeForPicker(
      PAGE_MOOD_PRESETS.lead.theme,
      pageTheme,
      'lead'
    );
    const creative = mergePageMoodThemeForPicker(
      PAGE_MOOD_PRESETS.creative.theme,
      pageTheme,
      'creative'
    );

    expect(lead.accent).toBe(PAGE_MOOD_PRESETS.lead.theme.accent);
    expect(creative.accent).toBe(PAGE_MOOD_PRESETS.creative.theme.accent);
    expect(lead.accent).not.toBe(creative.accent);
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

  it('builds build, journal, and signature voice typography', () => {
    expect(buildPageMoodPatch('build').theme?.accent).toBe(
      PROTOCOL_COLORS.green
    );
    expect(pageMoodTypographyFor('build').fontDisplay).toBe(
      MOOD_FONT_STACKS.mono
    );
    expect(pageMoodTypographyFor('journal').fontDisplay).toBe(
      MOOD_FONT_STACKS.editorial
    );
    expect(pageMoodTypographyFor('signature').fontDisplay).toBe(
      MOOD_FONT_STACKS.signatureDisplay
    );
    expect(pageMoodTypographyFor('signature').fontBody).toBe(
      'var(--app-font-sans)'
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
      '--mood-accent': PROTOCOL_COLORS.blue,
      '--mood-preset-accent': PROTOCOL_COLORS.blue,
      '--mood-preset-accent-light': PAGE_MOOD_PRESETS.protocol.theme.accentLight,
    });
  });

  it('splits broadsheet accentLight for editorial ink on light os', () => {
    const theme = PREMIUM_PAGE_MOOD_PRESETS.broadsheet.theme;
    expect(theme.accent).toBe('rgb(101 101 112 / 0.92)');
    expect(theme.accentLight).toBe('rgb(28 28 32 / 0.95)');
    expect(pageMoodPreviewCssVars('broadsheet', theme)).toMatchObject({
      '--mood-preset-accent': 'rgb(101 101 112 / 0.92)',
      '--mood-preset-accent-light': 'rgb(28 28 32 / 0.95)',
    });
    expect(pageMoodTypographyFor('broadsheet').fontDisplay).toBe(
      MOOD_FONT_STACKS.broadsheetTypewriter
    );
    expect(pageMoodTypographyFor('broadsheet').fontBody).toBe(
      MOOD_FONT_STACKS.broadsheetTypewriter
    );
    expect(pageMoodTypographyFor('journal').fontDisplay).toBe(
      MOOD_FONT_STACKS.editorial
    );
  });

  it('pairs voice mood textLight with green ink on light paper', () => {
    const build = PAGE_MOOD_PRESETS.build.theme;
    expect(build.text).toContain('212 251');
    expect(build.textLight).toBe('rgb(42 98 48 / 0.96)');
    expect(build.mutedLight).toBe('rgb(65 105 72 / 0.7)');

    const terminal = PREMIUM_PAGE_MOOD_PRESETS.terminal.theme;
    expect(terminal.text).toContain('57 255 20');
    expect(terminal.textLight).toBe('rgb(32 115 42 / 0.96)');
    expect(terminal.mutedLight).toBe('rgb(50 105 58 / 0.7)');
    expect(pageMoodTypographyFor('terminal').displayWeight).toBe(500);
    expect(pageMoodTypographyFor('build').displayWeight).toBe(600);
  });

  describe('wcag contrast floors', () => {
    type Rgba = [number, number, number, number];

    const parseColor = (c: string): Rgba => {
      const hex = c.match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const v = parseInt(hex[1], 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 1];
      }
      const rgb = c.match(
        /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i
      );
      if (rgb) {
        return [
          Number(rgb[1]),
          Number(rgb[2]),
          Number(rgb[3]),
          rgb[4] ? Number(rgb[4]) : 1,
        ];
      }
      throw new Error(`unparseable mood color: ${c}`);
    };

    const luminance = ([r, g, b]: [number, number, number]): number => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    const contrastRatio = (fgStr: string, bgStr: string): number => {
      const [r, g, b, a] = parseColor(fgStr);
      const bg = parseColor(bgStr);
      const flat: [number, number, number] = [
        r * a + bg[0] * (1 - a),
        g * a + bg[1] * (1 - a),
        b * a + bg[2] * (1 - a),
      ];
      const l1 = luminance(flat);
      const l2 = luminance([bg[0], bg[1], bg[2]]);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const allPresets = [
      ...Object.values(PAGE_MOOD_PRESETS),
      ...Object.values(PREMIUM_PAGE_MOOD_PRESETS),
    ];

    it('covers both os modes for every catalog mood', () => {
      expect(allPresets.length).toBeGreaterThanOrEqual(16);
      for (const preset of allPresets) {
        const t = preset.theme;
        for (const key of [
          'background',
          'backgroundLight',
          'text',
          'textLight',
          'muted',
          'mutedLight',
          'accent',
          'accentLight',
        ] as const) {
          expect(t[key], `${preset.id}.${key}`).toBeTruthy();
        }
      }
    });

    it.each(allPresets.map((p) => [p.id, p] as const))(
      '%s keeps text >= 4.5 and muted/accent >= 3.0 in both modes',
      (_id, preset) => {
        const t = preset.theme;
        const modes = [
          {
            bg: t.background,
            text: t.text,
            muted: t.muted,
            accent: t.accent,
          },
          {
            bg: t.backgroundLight,
            text: t.textLight,
            muted: t.mutedLight,
            accent: t.accentLight ?? t.accent,
          },
        ];
        for (const mode of modes) {
          expect(contrastRatio(mode.text, mode.bg)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(mode.muted, mode.bg)).toBeGreaterThanOrEqual(
            3.0
          );
          expect(contrastRatio(mode.accent, mode.bg)).toBeGreaterThanOrEqual(
            3.0
          );
        }
      }
    );
  });
});
