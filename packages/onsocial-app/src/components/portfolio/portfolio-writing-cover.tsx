'use client';

import { useMemo } from 'react';
import {
  canonicalizeMoodKey,
  DEFAULT_CARD_FORMAT,
  DEFAULT_MOOD,
  isCardFormat,
  isMarkColor,
  isMarkShape,
  previewTextCard,
  type CardFormat,
  type MarkColor,
  type MarkShape,
  type MoodKey,
} from '@onsocial/text-card';
import { ipfsImgSrcSet } from '@onsocial/ui';
import { displayName as accountDisplayName } from '@/lib/profile-display';

function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

/** Drop fixed width/height so the face stage can contain-fit (viewBox stays). */
function faceSvgMarkup(svg: string): string {
  return inlineSvgMarkup(svg)
    .replace(/\swidth="[^"]*"/i, '')
    .replace(/\sheight="[^"]*"/i, '');
}

function resolveCardMood(cardBg: string | null | undefined): MoodKey {
  return canonicalizeMoodKey(cardBg?.trim() ?? '') ?? DEFAULT_MOOD;
}

function resolveCardFormat(format: string | null | undefined): CardFormat {
  return isCardFormat(format) ? format : DEFAULT_CARD_FORMAT;
}

function resolveMarkShape(shape: string | null | undefined): MarkShape {
  return isMarkShape(shape) ? shape : 'rule';
}

function resolveMarkColor(color: string | null | undefined): MarkColor {
  return isMarkColor(color) ? color : 'auto';
}

export type PortfolioWritingCoverVariant = 'list' | 'article' | 'face';

export type WritingCoverPreviewInput = {
  title: string;
  accountId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  postId: string;
  issuedAt: number;
  cardBg?: string | null;
  format?: CardFormat | string | null;
  markShape?: MarkShape | string | null;
  markColor?: MarkColor | string | null;
};

/** Text-card SVG for list / article / DropArtOverlay when there is no photo. */
export function previewWritingCoverSvg(
  input: WritingCoverPreviewInput
): string {
  const { svg: markup } = previewTextCard({
    title: input.title,
    format: resolveCardFormat(input.format),
    creator: {
      accountId: input.accountId,
      displayName: accountDisplayName(input.accountId, input.displayName),
      ...(input.avatarUrl ? { avatar: input.avatarUrl } : {}),
    },
    theme: {
      bg: resolveCardMood(input.cardBg),
      markShape: resolveMarkShape(input.markShape),
      markColor: resolveMarkColor(input.markColor),
      titleAlign: 'left',
    },
    provenance: {
      issuedAt: input.issuedAt > 0 ? input.issuedAt : 0,
      postId: input.postId,
    },
  });
  return inlineSvgMarkup(markup);
}

/**
 * Variant rungs per slot: list thumbs are 88px catalog covers, article
 * covers span the 40rem writing column, face enlarge is full-viewport.
 */
const WRITING_COVER_VARIANT_WIDTHS: Record<
  PortfolioWritingCoverVariant,
  readonly [128, 384] | readonly [384, 1080] | readonly [1080, 1920]
> = {
  list: [128, 384],
  article: [384, 1080],
  face: [1080, 1920],
};

const WRITING_COVER_IMG_SIZES: Record<PortfolioWritingCoverVariant, string> = {
  list: '88px',
  article: '(max-width: 640px) 100vw, 608px',
  face: '100vw',
};

/**
 * Raster cover when present. Otherwise regenerate the text-card (create
 * pin / mint theme). List thumbs keep provenance aria-hidden upstream.
 * `face` — contain-fit enlarge (inline SVG so byline avatars load).
 */
export function PortfolioWritingCover({
  title,
  coverUrl,
  accountId,
  displayName,
  avatarUrl,
  postId,
  issuedAt,
  cardBg = null,
  format = null,
  markShape = null,
  markColor = null,
  variant = 'article',
}: WritingCoverPreviewInput & {
  coverUrl?: string | null;
  variant?: PortfolioWritingCoverVariant;
}) {
  const svg = useMemo(() => {
    if (coverUrl) return null;
    return previewWritingCoverSvg({
      title,
      accountId,
      displayName,
      avatarUrl,
      postId,
      issuedAt,
      cardBg,
      format,
      markShape,
      markColor,
    });
  }, [
    accountId,
    avatarUrl,
    cardBg,
    coverUrl,
    displayName,
    format,
    issuedAt,
    markColor,
    markShape,
    postId,
    title,
  ]);

  if (coverUrl) {
    const srcSet = ipfsImgSrcSet(
      coverUrl,
      WRITING_COVER_VARIANT_WIDTHS[variant]
    );
    return (
      <img
        alt=""
        className={
          variant === 'face'
            ? 'feed-photo-image'
            : 'portfolio-writing-cover-photo'
        }
        src={coverUrl}
        srcSet={srcSet}
        sizes={srcSet ? WRITING_COVER_IMG_SIZES[variant] : undefined}
        draggable={variant === 'face' ? false : undefined}
        loading={variant === 'face' ? undefined : 'lazy'}
        decoding="async"
      />
    );
  }

  if (!svg) return <div className="portfolio-writing-cover-fallback" />;

  /*
   * Face enlarge — inline SVG (avatars are external <image href>; that
   * cannot load inside an <img data:>). Square stage mirrors thought art.
   */
  if (variant === 'face') {
    return (
      <div
        className="feed-photo-image feed-photo-image--svg"
        dangerouslySetInnerHTML={{ __html: faceSvgMarkup(svg) }}
      />
    );
  }

  return (
    <div
      className={
        variant === 'list'
          ? 'portfolio-writing-cover-card portfolio-writing-cover-card--list'
          : 'portfolio-writing-cover-card'
      }
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
