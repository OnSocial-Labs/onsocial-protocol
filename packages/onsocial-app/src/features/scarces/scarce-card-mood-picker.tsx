'use client';

import {
  MARK_COLORS,
  MARK_SHAPES,
  THEME_MANIFEST,
  composeMoodKey,
  splitMoodKey,
  type MarkColor,
  type MarkShape,
  type MoodKey,
  type Palette,
  type TitleAlign,
  type Voice,
} from '@onsocial/text-card';

/**
 * Text-only auto-cards: every voice × palette from @onsocial/text-card,
 * plus the special `mono-matrix`. Receipt moods need a photo proof and are
 * omitted here (photo posts use the post image as cover instead).
 */
const LIST_VOICES = THEME_MANIFEST.voices.filter((v) => v.key !== 'receipt');
const MATRIX_OPTION = 'matrix' as const;
type StyleOption = Voice | typeof MATRIX_OPTION;

const MARK_SHAPE_LABELS: Record<MarkShape, string> = {
  rule: 'Dash',
  dot: 'Dot',
  square: 'Square',
  bar: 'Bar',
};

const MARK_COLOR_LABELS: Record<MarkColor, string> = {
  auto: 'Auto',
  violet: 'Violet',
  green: 'Green',
  orange: 'Orange',
  pink: 'Pink',
  cyan: 'Cyan',
  amber: 'Amber',
  purple: 'Purple',
  emerald: 'Emerald',
  rose: 'Rose',
  blue: 'Blue',
  lime: 'Lime',
  tangerine: 'Tangerine',
};

export interface ScarceCardThemeOptions {
  cardBg: MoodKey;
  cardMarkShape: MarkShape;
  cardMarkColor: MarkColor;
  cardTitleAlign: TitleAlign;
}

interface ScarceCardMoodPickerProps {
  value: ScarceCardThemeOptions;
  onChange: (next: ScarceCardThemeOptions) => void;
  disabled?: boolean;
}

function styleFromMood(value: MoodKey): {
  style: StyleOption;
  palette: Palette;
} {
  if (value === 'mono-matrix') {
    return { style: MATRIX_OPTION, palette: 'noir' };
  }
  const split = splitMoodKey(value);
  return {
    style: split?.voice ?? 'serif',
    palette: split?.palette ?? 'night',
  };
}

function patch(
  value: ScarceCardThemeOptions,
  partial: Partial<ScarceCardThemeOptions>
): ScarceCardThemeOptions {
  return { ...value, ...partial };
}

export function ScarceCardMoodPicker({
  value,
  onChange,
  disabled = false,
}: ScarceCardMoodPickerProps) {
  const { style, palette } = styleFromMood(value.cardBg);
  const isMatrix = style === MATRIX_OPTION;

  return (
    <div className="scarce-mood-picker">
      <label className="scarce-mood-picker-field">
        <span className="scarce-mood-picker-label">Style</span>
        <select
          className="scarce-mood-select"
          value={style}
          disabled={disabled}
          aria-label="Card style"
          onChange={(event) => {
            const next = event.target.value as StyleOption;
            if (next === MATRIX_OPTION) {
              onChange(patch(value, { cardBg: 'mono-matrix' }));
              return;
            }
            onChange(
              patch(value, { cardBg: composeMoodKey(next, palette) })
            );
          }}
        >
          {LIST_VOICES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
          <option value={MATRIX_OPTION}>Matrix</option>
        </select>
      </label>

      <label className="scarce-mood-picker-field">
        <span className="scarce-mood-picker-label">Finish</span>
        <select
          className="scarce-mood-select"
          value={isMatrix ? 'matrix' : palette}
          disabled={disabled || isMatrix}
          aria-label="Card finish"
          onChange={(event) => {
            if (isMatrix) return;
            onChange(
              patch(value, {
                cardBg: composeMoodKey(
                  style as Voice,
                  event.target.value as Palette
                ),
              })
            );
          }}
        >
          {THEME_MANIFEST.palettes.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
          {isMatrix ? <option value="matrix">Matrix</option> : null}
        </select>
      </label>

      <label className="scarce-mood-picker-field">
        <span className="scarce-mood-picker-label">Mark</span>
        <select
          className="scarce-mood-select"
          value={value.cardMarkShape}
          disabled={disabled}
          aria-label="Mark shape"
          onChange={(event) =>
            onChange(
              patch(value, {
                cardMarkShape: event.target.value as MarkShape,
              })
            )
          }
        >
          {MARK_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {MARK_SHAPE_LABELS[shape]}
            </option>
          ))}
        </select>
      </label>

      <label className="scarce-mood-picker-field">
        <span className="scarce-mood-picker-label">Colour</span>
        <select
          className="scarce-mood-select"
          value={value.cardMarkColor}
          disabled={disabled}
          aria-label="Mark colour"
          onChange={(event) =>
            onChange(
              patch(value, {
                cardMarkColor: event.target.value as MarkColor,
              })
            )
          }
        >
          <option value="auto">{MARK_COLOR_LABELS.auto}</option>
          {MARK_COLORS.map((color) => (
            <option key={color} value={color}>
              {MARK_COLOR_LABELS[color]}
            </option>
          ))}
        </select>
      </label>

      <label className="scarce-mood-picker-field scarce-mood-picker-field--wide">
        <span className="scarce-mood-picker-label">Title</span>
        <select
          className="scarce-mood-select"
          value={value.cardTitleAlign}
          disabled={disabled}
          aria-label="Title alignment"
          onChange={(event) =>
            onChange(
              patch(value, {
                cardTitleAlign: event.target.value as TitleAlign,
              })
            )
          }
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
        </select>
      </label>
    </div>
  );
}
