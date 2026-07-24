'use client';

import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
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
import { parsePostText } from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';
import {
  isRenderablePostVideoMime,
  parsePostMedia,
  type PostMediaItem,
} from '@/lib/post-media';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

/**
 * Live preview renders generated cards as inline SVG (not `<img
 * src=data:svg>`). Nested https faces/photos work in the DOM; browsers
 * block them inside SVG-as-image. Mint still inlines bytes into PNG.
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
  /** Sheet picker vs in-feed media slot. */
  variant?: 'sheet' | 'feed';
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

/** Cover image for the scarce — first image only (matches fromPost.list). */
export function postScarceCoverImage(post: PostRow): PostMediaItem | null {
  const items = parsePostMedia(post.value);
  return items.find((item) => !isRenderablePostVideoMime(item.mime)) ?? null;
}

/** Live card / cover preview — tap to expand. */
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
  variant = 'sheet',
}: ScarcePostPreviewProps) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const [fallbackIssuedAt] = useState(() => Date.now());
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const cover = postScarceCoverImage(post);
  const listingCover = mediaUrl?.trim() || null;
  const isPhotoCard = cardFormat === 'receipt' || cardFormat === 'proof';
  const title = previewTitle(post, cardFormat);
  const creatorLabel = displayName(
    post.accountId,
    creatorDisplayName ?? undefined
  );
  const avatarUrl = creatorAvatarUrl?.trim() || '';
  const photoUrl = isPhotoCard ? cover?.url?.trim() || '' : '';

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const textCardSvg = useMemo(() => {
    if (listingCover || (cover && !isPhotoCard)) return null;
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

  const rasterSrc =
    (isPhotoCard ? null : cover?.url) ?? listingCover ?? null;
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
        aria-label="Preview card"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setExpanded(true);
        }}
      >
        {inlineSvg ? (
          <div
            className="scarce-post-preview-asset scarce-post-preview-svg"
            dangerouslySetInnerHTML={{ __html: inlineSvg }}
          />
        ) : (
          <img className="scarce-post-preview-asset" src={rasterSrc!} alt="" />
        )}
      </button>

      {mounted && expanded
        ? createPortal(
            <div
              className="scarce-card-lightbox"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={() => setExpanded(false)}
            >
              <p id={titleId} className="sr-only">
                Card preview
              </p>
              {inlineSvg ? (
                <div
                  className="scarce-card-lightbox-asset scarce-card-lightbox-svg"
                  dangerouslySetInnerHTML={{ __html: inlineSvg }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <img
                  className="scarce-card-lightbox-asset"
                  src={rasterSrc!}
                  alt=""
                  onClick={(event) => event.stopPropagation()}
                />
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
