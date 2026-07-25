'use client';

import type { CSSProperties } from 'react';
import {
  MARK_COLOR_HEX,
  type CardFormat,
  type MarkColor,
  type MarkShape,
} from '@onsocial/text-card';
import {
  ImageIcon,
  NoteTextIcon,
  VideoPlayerIcon,
} from '@onsocial/ui';

export type ScarceCoverMode = 'card' | 'frame' | 'photo';

/** Round colour chip — Auto uses a conic rainbow; named colours use hex. */
export function ScarceColourSwatch({
  color,
  size = 'option',
}: {
  color: MarkColor;
  size?: 'option' | 'chip';
}) {
  const className = `scarce-choice-swatch scarce-choice-swatch--colour scarce-choice-swatch--${size}${
    color === 'auto' ? ' is-auto' : ''
  }`;
  if (color === 'auto') {
    return <span className={className} aria-hidden />;
  }
  return (
    <span
      className={className}
      style={{ '--scarce-swatch': MARK_COLOR_HEX[color] } as CSSProperties}
      aria-hidden
    />
  );
}

/** Mini finish preview — palette gradient with an “Aa” sample. */
export function ScarceFinishSwatch({
  bgFrom,
  bgTo,
  textPrimary,
  size = 'option',
}: {
  bgFrom: string;
  bgTo: string;
  textPrimary: string;
  size?: 'option' | 'chip';
}) {
  return (
    <span
      className={`scarce-choice-swatch scarce-choice-swatch--finish scarce-choice-swatch--${size}`}
      style={
        {
          '--scarce-finish-from': bgFrom,
          '--scarce-finish-to': bgTo,
          '--scarce-finish-text': textPrimary,
        } as CSSProperties
      }
      aria-hidden
    >
      {size === 'option' ? <span className="scarce-choice-swatch-aa">Aa</span> : null}
    </span>
  );
}

/** Literal mark geometry at picker scale. */
export function ScarceMarkSwatch({
  shape,
  color,
  size = 'option',
}: {
  shape: MarkShape;
  color: string;
  size?: 'option' | 'chip';
}) {
  const mark = (() => {
    switch (shape) {
      case 'dot':
        return <circle cx="12" cy="12" r="4.5" fill={color} />;
      case 'square':
        return <rect x="7" y="7" width="10" height="10" rx="1.2" fill={color} />;
      case 'bar':
        return (
          <rect x="10.5" y="4" width="3" height="16" rx="1.5" fill={color} />
        );
      case 'rule':
      default:
        return (
          <rect x="3" y="10.5" width="18" height="3" rx="1.5" fill={color} />
        );
    }
  })();

  return (
    <span
      className={`scarce-choice-swatch scarce-choice-swatch--mark scarce-choice-swatch--${size}`}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false">
        {mark}
      </svg>
    </span>
  );
}

export function resolveMarkPreviewColor(
  color: MarkColor,
  fallback = '#7C5CFF'
): string {
  if (color === 'auto') return fallback;
  return MARK_COLOR_HEX[color];
}

/** Mage Cover glyphs — Text card / Frame / Photo. */
export function ScarceCoverIcon({
  mode,
  size = 'option',
}: {
  mode: ScarceCoverMode;
  size?: 'option' | 'chip';
}) {
  const className = 'scarce-choice-swatch-mage';
  const glyph =
    mode === 'frame' ? (
      <VideoPlayerIcon className={className} aria-hidden />
    ) : mode === 'photo' ? (
      <ImageIcon className={className} aria-hidden />
    ) : (
      <NoteTextIcon className={className} aria-hidden />
    );

  return (
    <span
      className={`scarce-choice-swatch scarce-choice-swatch--icon scarce-choice-swatch--${size}`}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

/**
 * Mini type specimen for Format — the preview *is* the choice (not a
 * symbolic metaphor). Uses the same voice fonts as the minted card.
 */
export function ScarceFormatSwatch({
  format,
  size = 'option',
}: {
  format: CardFormat;
  size?: 'option' | 'chip';
}) {
  if (format === 'receipt' || format === 'proof') {
    return (
      <span
        className={`scarce-choice-swatch scarce-choice-swatch--format scarce-choice-swatch--format-${format} scarce-choice-swatch--${size}`}
        aria-hidden
      >
        <span className="scarce-choice-format-photo" />
        <span className="scarce-choice-format-caption">Aa</span>
      </span>
    );
  }

  const sample = format === 'poster' ? 'AA' : 'Aa';

  return (
    <span
      className={`scarce-choice-swatch scarce-choice-swatch--format scarce-choice-swatch--format-${format} scarce-choice-swatch--${size}`}
      aria-hidden
    >
      <span className="scarce-choice-format-aa">{sample}</span>
    </span>
  );
}
