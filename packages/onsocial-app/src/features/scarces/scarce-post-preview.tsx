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
    : 100;
  const text = parsePostText(post.value).trim();
  if (!text) return 'Untitled';
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? text;
  if (firstLine.length <= maxCharacters) return firstLine;
  const window = firstLine.slice(0, maxCharacters);
  const lastSpace = window.lastIndexOf(' ');
  return `${(lastSpace >= 40 ? window.slice(0, lastSpace) : window).trimEnd()}…`;
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

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const textCardUri = useMemo(() => {
    if (listingCover || (cover && !isPhotoCard)) return null;
    const { dataUri } = previewTextCard({
      title,
      ...(cardFormat ? { format: cardFormat } : {}),
      creator: {
        accountId: post.accountId,
        displayName: creatorLabel,
      },
      theme: {
        bg: cardBg,
        markShape: cardMarkShape,
        markColor: cardMarkColor,
        titleAlign: cardTitleAlign,
      },
      ...(isPhotoCard && cover?.url ? { photo: cover.url } : {}),
      provenance: {
        issuedAt: post.blockTimestamp || fallbackIssuedAt,
        postId: post.postId,
      },
    });
    return dataUri;
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
    cardBg,
    cardFormat,
    cardMarkShape,
    cardMarkColor,
    cardTitleAlign,
  ]);

  const src =
    (isPhotoCard ? textCardUri : cover?.url) ?? listingCover ?? textCardUri;
  if (!src) return null;
  const isPhotoCover = Boolean((cover && !isPhotoCard) || listingCover);

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
        <img className="scarce-post-preview-asset" src={src} alt="" />
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
              <img
                className="scarce-card-lightbox-asset"
                src={src}
                alt=""
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
