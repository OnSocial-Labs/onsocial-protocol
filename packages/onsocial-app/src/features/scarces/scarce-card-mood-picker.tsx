'use client';

import {
  CARD_FORMAT_REGISTRY,
  CARD_FORMATS,
  MARK_COLORS,
  MARK_SHAPES,
  THEME_MANIFEST,
  moodForCardFormat,
  type CardFormat,
  type MarkColor,
  type MarkShape,
  type MoodKey,
  type Palette,
  type TitleAlign,
} from '@onsocial/text-card';
import { ScarceFieldSelectMenu } from '@/features/scarces/scarce-field-select-menu';

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
  cardFormat: CardFormat;
  cardPalette: Palette;
  cardBg: MoodKey;
  cardMarkShape: MarkShape;
  cardMarkColor: MarkColor;
  /** Format-controlled; not user-facing. */
  cardTitleAlign: TitleAlign;
}

interface ScarceCardMoodPickerProps {
  value: ScarceCardThemeOptions;
  onChange: (next: ScarceCardThemeOptions) => void;
  disabled?: boolean;
  hasPhoto?: boolean;
  formats?: readonly CardFormat[];
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
  hasPhoto = false,
  formats,
}: ScarceCardMoodPickerProps) {
  const format = CARD_FORMAT_REGISTRY[value.cardFormat];
  const availableFormats = (formats ?? CARD_FORMATS).filter(
    (key) => hasPhoto || !CARD_FORMAT_REGISTRY[key].requiresPhoto
  );

  const formatOptions = availableFormats.map((key) => ({
    value: key,
    label: CARD_FORMAT_REGISTRY[key].label,
  }));

  const finishOptions = THEME_MANIFEST.palettes
    .filter((item) => format.palettes.includes(item.key as Palette))
    .map((item) => ({
      value: item.key as Palette,
      label: item.label,
    }));

  const markOptions = MARK_SHAPES.map((shape) => ({
    value: shape,
    label: MARK_SHAPE_LABELS[shape],
  }));

  const colourOptions: { value: MarkColor; label: string }[] = [
    { value: 'auto', label: MARK_COLOR_LABELS.auto },
    ...MARK_COLORS.map((color) => ({
      value: color as MarkColor,
      label: MARK_COLOR_LABELS[color],
    })),
  ];

  return (
    <div className="scarce-mood-picker-block">
      <div className="scarce-mood-picker">
        <ScarceFieldSelectMenu
          label="Format"
          value={value.cardFormat}
          options={formatOptions}
          disabled={disabled}
          onChange={(next) => {
            const nextFormat = CARD_FORMAT_REGISTRY[next];
            const nextPalette = nextFormat.defaultPalette;
            onChange(
              patch(value, {
                cardFormat: next,
                cardPalette: nextPalette,
                cardBg: moodForCardFormat(next, nextPalette),
                cardTitleAlign: 'left',
              })
            );
          }}
        />

        <ScarceFieldSelectMenu
          label="Finish"
          value={value.cardPalette}
          options={finishOptions}
          disabled={disabled}
          onChange={(next) => {
            onChange(
              patch(value, {
                cardPalette: next,
                cardBg: moodForCardFormat(value.cardFormat, next),
              })
            );
          }}
        />

        <ScarceFieldSelectMenu
          label="Mark"
          value={value.cardMarkShape}
          options={markOptions}
          disabled={disabled}
          onChange={(next) =>
            onChange(patch(value, { cardMarkShape: next }))
          }
        />

        <ScarceFieldSelectMenu
          label="Colour"
          value={value.cardMarkColor}
          options={colourOptions}
          disabled={disabled}
          onChange={(next) =>
            onChange(patch(value, { cardMarkColor: next }))
          }
        />
      </div>
      <p className="scarce-mood-picker-hint">
        Up to {format.maxCharacters} characters on the cover
      </p>
    </div>
  );
}
