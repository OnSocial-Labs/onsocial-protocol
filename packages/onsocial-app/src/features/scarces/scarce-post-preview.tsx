'use client';

import { useMemo, useState } from 'react';
import type {
  CardFormat,
  MarkColor,
  MarkShape,
  MoodKey,
  TitleAlign,
} from '@onsocial/text-card';
import {
  CARD_FORMAT_REGISTRY,
  DEFAULT_MOOD,
  previewTextCard,
} from '@onsocial/text-card';
import type { PostRow } from '@onsocial/sdk';
import { DropImageLightbox } from '@/features/scarces/drop-artwork-preview';
import { parsePostText } from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';
import {
  isRenderablePostAudioMime,
  isRenderablePostPlayableMime,
  isRenderablePostVideoMime,
  parsePostMedia,
  type PostMediaItem,
} from '@/lib/post-media';

/**
 * Fallback live SVG for feed/buy when no mint raster URL is supplied.
 * List sheet prefers gateway mint PNG (`mediaUrl`) so preview matches mint.
 * Nested https faces/photos work in DOM SVG; browsers block them in
 * SVG-as-image. Mint inlines bytes into PNG.
 */
function inlineSvgMarkup(svg: string): string {
  return svg.replace(/^<\?xml[^>]*>\s*/i, '');
}

interface ScarcePostPreviewProps {
  post: PostRow;
  /** Text-card mood when the post has no image cover. */
  cardBg?: MoodKey | string;
  /** Locked layout used to generate the text card. */
  cardFormat?: CardFormat;
  cardMarkShape?: MarkShape;
  cardMarkColor?: MarkColor;
  cardTitleAlign?: TitleAlign;
  /** Profile display name for text-card byline. */
  creatorDisplayName?: string | null;
  /** Optional profile face URL for the text-card signature preview. */
  creatorAvatarUrl?: string | null;
  /**
   * Listing cover URL (IPFS text-card / photo). Wins over a generated
   * preview when the post itself has no photo.
   */
  mediaUrl?: string | null;
  /**
   * After mint/list: never render live text-card SVG (softer than the
   * stamped PNG). Hold the last raster URL across brief mediaUrl gaps.
   */
  disableLiveSvg?: boolean;
  /** Sheet picker vs in-feed media slot. */
  variant?: 'sheet' | 'feed';
  /**
   * When set (feed medium shell), tap calls this instead of the zoom
   * overlay. Sheet / list pickers keep tap-to-zoom.
   */
  onActivate?: (detail: {
    mediaUrl: string | null;
    coverSvg: string | null;
  }) => void;
}

function previewTitle(post: PostRow, format?: CardFormat): string {
  const maxCharacters = format
    ? CARD_FORMAT_REGISTRY[format].maxCharacters
    : 108;
  const text = parsePostText(post.value).trim();
  // Match SDK fromPost title fallback for media-only / empty posts.
  if (!text) return `Post ${post.postId}`;
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? text;
  if (firstLine.length <= maxCharacters) return firstLine;
  const window = firstLine.slice(0, maxCharacters);
  const lastSpace = window.lastIndexOf(' ');
  return `${(lastSpace >= maxCharacters / 2 ? window.slice(0, lastSpace) : window).trimEnd()}…`;
}

/** Cover image for the scarce — first still only (matches fromPost.list). */
export function postScarceCoverImage(post: PostRow): PostMediaItem | null {
  const items = parsePostMedia(post.value);
  return items.find((item) => !isRenderablePostPlayableMime(item.mime)) ?? null;
}

/**
 * First video on the post. It can never be the NEP-177 cover, but it is
 * what the creator is selling — the listing flow offers a frame from it
 * as the still cover.
 */
export function postScarceVideo(post: PostRow): PostMediaItem | null {
  const items = parsePostMedia(post.value);
  return items.find((item) => isRenderablePostVideoMime(item.mime)) ?? null;
}

/**
 * First audio on the post. Same rule as video: never the wallet cover —
 * the creator picks (or uploads) a still, and the track stays playable.
 */
export function postScarceAudio(post: PostRow): PostMediaItem | null {
  const items = parsePostMedia(post.value);
  return items.find((item) => isRenderablePostAudioMime(item.mime)) ?? null;
}

/** Live card / cover preview — tap to expand in OsPageSheet. */
export function ScarcePostPreview({
  post,
  cardBg = DEFAULT_MOOD,
  cardFormat,
  cardMarkShape = 'rule',
  cardMarkColor = 'auto',
  cardTitleAlign = 'left',
  creatorDisplayName = null,
  creatorAvatarUrl = null,
  mediaUrl = null,
  disableLiveSvg = false,
  variant = 'sheet',
  onActivate,
}: ScarcePostPreviewProps) {
  const [heldListingCover, setHeldListingCover] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const useMediumActivate = Boolean(onActivate);
  const [fallbackIssuedAt] = useState(() => Date.now());

  const cover = postScarceCoverImage(post);
  const incomingListingCover = mediaUrl?.trim() || null;
  if (incomingListingCover && incomingListingCover !== heldListingCover) {
    setHeldListingCover(incomingListingCover);
  }
  const listingCover =
    incomingListingCover || (disableLiveSvg ? heldListingCover : null);
  const blockLiveSvg = disableLiveSvg || Boolean(listingCover);
  const isPhotoCard = cardFormat === 'receipt' || cardFormat === 'proof';
  const title = previewTitle(post, cardFormat);
  const creatorLabel = displayName(
    post.accountId,
    creatorDisplayName ?? undefined
  );
  const avatarUrl = creatorAvatarUrl?.trim() || '';
  const photoUrl = isPhotoCard ? cover?.url?.trim() || '' : '';

  const textCardSvg = useMemo(() => {
    if (blockLiveSvg || listingCover || (cover && !isPhotoCard)) return null;
    const { svg } = previewTextCard({
      title,
      ...(cardFormat ? { format: cardFormat } : {}),
      creator: {
        accountId: post.accountId,
        displayName: creatorLabel,
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      },
      theme: {
        bg: cardBg,
        markShape: cardMarkShape,
        markColor: cardMarkColor,
        titleAlign: cardTitleAlign,
      },
      ...(photoUrl ? { photo: photoUrl } : {}),
      provenance: {
        issuedAt: post.blockTimestamp || fallbackIssuedAt,
        postId: post.postId,
      },
    });
    return svg;
  }, [
    blockLiveSvg,
    cover,
    isPhotoCard,
    listingCover,
    title,
    post.accountId,
    post.postId,
    post.blockTimestamp,
    fallbackIssuedAt,
    creatorLabel,
    avatarUrl,
    photoUrl,
    cardBg,
    cardFormat,
    cardMarkShape,
    cardMarkColor,
    cardTitleAlign,
  ]);

  const rasterSrc = listingCover ?? (isPhotoCard ? null : cover?.url) ?? null;
  const inlineSvg = textCardSvg ? inlineSvgMarkup(textCardSvg) : null;
  if (!rasterSrc && !inlineSvg) return null;
  const isPhotoCover = Boolean(rasterSrc);

  return (
    <>
      <button
        type="button"
        className={[
          'scarce-post-preview',
          isPhotoCover
            ? 'scarce-post-preview--cover'
            : 'scarce-post-preview--card',
          variant === 'feed' ? 'scarce-post-preview--feed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={useMediumActivate ? 'Open Drop preview' : 'Preview card'}
        aria-haspopup={useMediumActivate ? undefined : 'dialog'}
        aria-expanded={useMediumActivate ? undefined : zoomOpen}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onActivate) {
            onActivate({
              mediaUrl: rasterSrc,
              coverSvg: inlineSvg,
            });
            return;
          }
          setZoomOpen(true);
        }}
      >
        {inlineSvg ? (
          <div
            className="scarce-post-preview-asset scarce-post-preview-svg"
            dangerouslySetInnerHTML={{ __html: inlineSvg }}
          />
        ) : (
          <img
            key={rasterSrc!}
            className="scarce-post-preview-asset"
            src={rasterSrc!}
            alt=""
          />
        )}
      </button>

      {useMediumActivate ? null : (
        <DropImageLightbox
          open={zoomOpen}
          label="Card preview"
          onClose={() => setZoomOpen(false)}
          {...(inlineSvg ? { svg: inlineSvg } : { src: rasterSrc! })}
        />
      )}
    </>
  );
}
