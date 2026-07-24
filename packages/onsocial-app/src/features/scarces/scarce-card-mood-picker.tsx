'use client';

import type { ReactNode } from 'react';
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
import { ScarceChoiceField } from '@/features/scarces/scarce-choice-field';
import {
  ScarceColourSwatch,
  ScarceFinishSwatch,
  ScarceMarkSwatch,
  resolveMarkPreviewColor,
} from '@/features/scarces/scarce-choice-visuals';

const MARK_SHAPE_LABELS: Record<MarkShape, string> = {
  rule: 'Dash',
  dot: 'Dot',
  square: 'Square',
  bar: 'Bar',
};

const MARK_SHAPE_HINTS: Record<MarkShape, string> = {
  rule: 'Horizontal accent',
  dot: 'Soft point',
  square: 'Solid block',
  bar: 'Vertical accent',
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

function paletteTagline(tagline: string): string {
  const first = tagline.split('.')[0]?.trim();
  return first || tagline;
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
  const finishMeta = THEME_MANIFEST.palettes.find(
    (item) => item.key === value.cardPalette
  );
  const markPreviewColor = resolveMarkPreviewColor(value.cardMarkColor);

  const formatOptions = availableFormats.map((key) => {
    const spec = CARD_FORMAT_REGISTRY[key];
    return {
      value: key,
      label: spec.label,
      description: `Up to ${spec.maxCharacters} characters`,
    };
  });

  const finishOptions = THEME_MANIFEST.palettes
    .filter((item) => format.palettes.includes(item.key as Palette))
    .map((item) => ({
      value: item.key as Palette,
      label: item.label,
      description: paletteTagline(item.tagline),
      leading: (
        <ScarceFinishSwatch
          bgFrom={item.bgFrom}
          bgTo={item.bgTo}
          textPrimary={item.textPrimary}
        />
      ),
    }));

  const markOptions = MARK_SHAPES.map((shape) => ({
    value: shape,
    label: MARK_SHAPE_LABELS[shape],
    description: MARK_SHAPE_HINTS[shape],
    leading: (
      <ScarceMarkSwatch shape={shape} color={markPreviewColor} />
    ),
  }));

  const colourOptions: {
    value: MarkColor;
    label: string;
    description?: string;
    section: string;
    leading: ReactNode;
  }[] = [
    {
      value: 'auto',
      label: MARK_COLOR_LABELS.auto,
      description: 'Picked from your account',
      section: 'Default',
      leading: <ScarceColourSwatch color="auto" />,
    },
    ...MARK_COLORS.map((color) => ({
      value: color as MarkColor,
      label: MARK_COLOR_LABELS[color],
      section: 'Colours',
      leading: <ScarceColourSwatch color={color} />,
    })),
  ];

  return (
    <>
      <ScarceChoiceField
        label="Format"
        value={value.cardFormat}
        options={formatOptions}
        disabled={disabled}
        copy="Cover layout and character limit."
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
      <ScarceChoiceField
        label="Finish"
        value={value.cardPalette}
        options={finishOptions}
        disabled={disabled}
        copy="Paper and lighting."
        chipLeading={
          finishMeta ? (
            <ScarceFinishSwatch
              bgFrom={finishMeta.bgFrom}
              bgTo={finishMeta.bgTo}
              textPrimary={finishMeta.textPrimary}
              size="chip"
            />
          ) : null
        }
        onChange={(next) => {
          onChange(
            patch(value, {
              cardPalette: next,
              cardBg: moodForCardFormat(value.cardFormat, next),
            })
          );
        }}
      />
      <ScarceChoiceField
        label="Mark"
        value={value.cardMarkShape}
        options={markOptions}
        disabled={disabled}
        copy="Accent shape."
        chipLeading={
          <ScarceMarkSwatch
            shape={value.cardMarkShape}
            color={markPreviewColor}
            size="chip"
          />
        }
        onChange={(next) => onChange(patch(value, { cardMarkShape: next }))}
      />
      <ScarceChoiceField
        label="Colour"
        value={value.cardMarkColor}
        options={colourOptions}
        disabled={disabled}
        copy="Accent colour."
        chipLeading={
          <ScarceColourSwatch color={value.cardMarkColor} size="chip" />
        }
        onChange={(next) => onChange(patch(value, { cardMarkColor: next }))}
      />
    </>
  );
}
