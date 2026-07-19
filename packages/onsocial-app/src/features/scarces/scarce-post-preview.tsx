'use client';

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type {
  MarkColor,
  MarkShape,
  MoodKey,
  TitleAlign,
} from '@onsocial/text-card';
import { DEFAULT_MOOD, previewTextCard } from '@onsocial/text-card';
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
  cardMarkShape?: MarkShape;
  cardMarkColor?: MarkColor;
  cardTitleAlign?: TitleAlign;
  /** Profile display name for text-card byline. */
  creatorDisplayName?: string | null;
}

function previewTitle(post: PostRow): string {
  const text = parsePostText(post.value).trim();
  if (!text) return 'Untitled';
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? text;
  if (firstLine.length <= 100) return firstLine;
  const window = firstLine.slice(0, 100);
  const lastSpace = window.lastIndexOf(' ');
  return `${(lastSpace >= 40 ? window.slice(0, lastSpace) : window).trimEnd()}…`;
}

/** Cover image for the scarce — first image only (matches fromPost.list). */
export function postScarceCoverImage(post: PostRow): PostMediaItem | null {
  const items = parsePostMedia(post.value);
  return (
    items.find((item) => !isRenderablePostVideoMime(item.mime)) ?? null
  );
}

/** Live card / cover preview — tap to expand. */
export function ScarcePostPreview({
  post,
  cardBg = DEFAULT_MOOD,
  cardMarkShape = 'rule',
  cardMarkColor = 'auto',
  cardTitleAlign = 'left',
  creatorDisplayName = null,
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
  const title = previewTitle(post);
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
    if (cover) return null;
    const { dataUri } = previewTextCard({
      title,
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
      provenance: {
        issuedAt: post.blockTimestamp || fallbackIssuedAt,
        postId: post.postId,
      },
    });
    return dataUri;
  }, [
    cover,
    title,
    post.accountId,
    post.postId,
    post.blockTimestamp,
    fallbackIssuedAt,
    creatorLabel,
    cardBg,
    cardMarkShape,
    cardMarkColor,
    cardTitleAlign,
  ]);

  const src = cover?.url ?? textCardUri;
  if (!src) return null;

  return (
    <>
      <button
        type="button"
        className={`scarce-post-preview${cover ? ' scarce-post-preview--cover' : ' scarce-post-preview--card'}`}
        aria-label="Preview card"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={() => setExpanded(true)}
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
