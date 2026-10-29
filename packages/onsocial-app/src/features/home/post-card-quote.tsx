'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import {
  Divider,
  PlayFillIcon,
  ipfsImgVariantUrl,
  MessageRoundIcon,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { displayName } from '@/lib/profile-display';
import { FeedPhotoEnlargeScreen } from '@/features/home/feed-photo-enlarge-screen';
import {
  zoomOriginFromTile,
  type FeedPhotoZoomOrigin,
} from '@/features/home/feed-photo-zoom';
import type { ThreadSheetContext } from '@/lib/guild-thread-card-context';
import { portfolioPath } from '@/lib/overlay-routes';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import {
  collageCellStyle,
  collageHero,
  formatMediaDuration,
  isRenderablePostAudioMime,
  isRenderablePostVideoMime,
  parsePostMedia,
  truncateQuoteText,
  type PostMediaItem,
} from '@/lib/post-media';
import { formatPostTimestamp, parsePostText } from '@/lib/post-display';
import { isAppPostSheetHref } from '@/lib/post-routes';
import {
  PostMediaStrip,
  useFeedMediaResolved,
} from '@/features/home/post-media';
import { usePostVideoPlayback } from '@/hooks/use-post-list-video';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { usePostThreadLayer } from '@/features/home/post-thread-layer';
import { PostRichText } from '@/features/home/post-rich-text';
import { PostSensitiveGate } from '@/features/home/post-sensitive-gate';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';

export function QuotedPostInset({
  post,
  authorProfile,
  href,
  expanded = false,
  sheetContext = null,
}: {
  post: PostRow;
  authorProfile?: PostAuthorProfile;
  /** Navigate to the quoted post's own page (feed/thread surfaces). */
  href?: string;
  /** Opened post — quoted media at page size. Feed and compose stay the small thumb. */
  expanded?: boolean;
  sheetContext?: ThreadSheetContext | null;
}) {
  const router = useRouter();
  const { openPostThread } = usePostThreadLayer();
  const { safeMode } = useViewerSafeMode();
  const labels = parsePostContentLabels(post.value);
  const name = displayName(post.accountId, authorProfile?.displayName);
  const text = truncateQuoteText(parsePostText(post.value));
  const mediaItems = parsePostMedia(post.value).slice(0, 4);
  const compactMedia = !expanded && mediaItems.length > 0 ? mediaItems : null;
  const interactive = Boolean(href);
  const [quotePhotoOpen, setQuotePhotoOpen] = useState(false);
  const [quotePhotoIndex, setQuotePhotoIndex] = useState(0);
  const [quoteZoomOrigin, setQuoteZoomOrigin] =
    useState<FeedPhotoZoomOrigin | null>(null);
  const [quoteThreadOpen, setQuoteThreadOpen] = useState(false);

  const open = (event: {
    preventDefault(): void;
    stopPropagation(): void;
    target?: EventTarget | null;
  }) => {
    if (!href) return;
    // Let nested # / @ / $ / external links win over the inset navigate.
    if (
      event.target instanceof Element &&
      event.target.closest('a[href], button')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isAppPostSheetHref(href)) {
      openPostThread({ href, root: post, context: sheetContext });
      return;
    }
    router.push(href);
  };

  return (
    <>
      <div
        className={`post-card-quote-inset${interactive ? ' post-card-quote-inset--link' : ''}`}
        role={interactive ? 'link' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? `View quoted post by ${name}` : undefined}
        onClick={interactive ? open : undefined}
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') open(event);
              }
            : undefined
        }
      >
        <Divider orientation="vertical" variant="detail" />
        <div className="post-card-quote-inset-content">
          <span className="post-card-quote-inset-head">
            <AccountAvatar
              accountId={post.accountId}
              kind={authorProfile?.kind}
              src={authorProfile?.avatarUrl ?? null}
              fallbackInitial={name}
              size="sm"
              className="post-card-quote-inset-avatar"
            />
            <PostIdentityMeta
              name={name}
              accountId={post.accountId}
              timestamp={post.blockTimestamp}
            />
          </span>
          <PostSensitiveGate labels={labels} safeMode={safeMode} compact>
            {compactMedia || (expanded && mediaItems.length > 0) || text ? (
              <div
                className={[
                  'post-card-quote-inset-body-row',
                  compactMedia ? 'has-media' : '',
                  expanded && mediaItems.length > 0 ? 'is-expanded' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {compactMedia ? <QuoteMediaThumb items={compactMedia} /> : null}
                {text ? (
                  <p className="post-card-quote-inset-body">
                    <PostRichText text={text} />
                  </p>
                ) : null}
                {expanded && mediaItems.length > 0 ? (
                  <PostMediaStrip
                    items={mediaItems}
                    size="page"
                    onActivate={(index, tile) => {
                      setQuoteZoomOrigin(zoomOriginFromTile(tile, index));
                      setQuotePhotoIndex(index);
                      setQuotePhotoOpen(true);
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="post-card-quote-inset-body">…</p>
            )}
          </PostSensitiveGate>
        </div>
      </div>
      {expanded && mediaItems.length > 0 ? (
        <FeedPhotoEnlargeScreen
          open={quotePhotoOpen}
          onOpenChange={(open) => {
            setQuotePhotoOpen(open);
            if (!open) setQuoteThreadOpen(false);
          }}
          title={
            mediaItems.some((item) => isRenderablePostVideoMime(item.mime))
              ? 'Media'
              : 'Photos'
          }
          caption={text.trim() ? text : null}
          captionDate={
            post.blockTimestamp
              ? formatPostTimestamp(post.blockTimestamp)
              : null
          }
          photos={mediaItems}
          initialIndex={quotePhotoIndex}
          zoomOrigin={quoteZoomOrigin}
          threadOpen={quoteThreadOpen}
          onDismissThread={() => setQuoteThreadOpen(false)}
          threadAuthor={post.accountId}
          threadPostId={post.postId}
          threadRoot={post}
          peekIdentity={
            <div className="feed-photo-caption-identity-row">
              <Link
                href={portfolioPath(post.accountId)}
                className="os-media-face-identity"
                scroll={false}
                aria-label={`View ${name}'s profile`}
                onClick={() => {
                  setQuotePhotoOpen(false);
                  setQuoteThreadOpen(false);
                }}
              >
                <AccountAvatar
                  accountId={post.accountId}
                  kind={authorProfile?.kind}
                  src={authorProfile?.avatarUrl ?? null}
                  fallbackInitial={name}
                  size="lg"
                  className="post-card-avatar"
                />
                <span className="os-media-face-identity-copy">
                  <span className="os-media-face-identity-name-row">
                    <span className="os-media-face-identity-name">{name}</span>
                  </span>
                  <span className="os-media-face-identity-handle">
                    @{post.accountId}
                  </span>
                </span>
              </Link>
            </div>
          }
          engagement={
            <div className="post-card-engagement">
              <div className="post-card-engagement-actions">
                <button
                  type="button"
                  className="post-card-stat post-card-stat-button"
                  aria-label="Reply to this post"
                  onClick={() => setQuoteThreadOpen(true)}
                >
                  <MessageRoundIcon aria-hidden />
                  Reply
                </button>
              </div>
            </div>
          }
        />
      ) : null}
    </>
  );
}

function QuoteThumbTile({
  item,
  style,
  onRatio,
}: {
  item: PostMediaItem;
  style?: CSSProperties;
  onRatio: (url: string, ratio: number) => void;
}) {
  const isVideo = isRenderablePostVideoMime(item.mime);
  const { containerRef, bindVideoEl, videoPreload, videoMounted } =
    usePostVideoPlayback(isVideo ? 'poster' : null);
  const { resolved, markResolved, bind } = useFeedMediaResolved(item.url);
  const remember = (width: number, height: number) => {
    if (width > 0 && height > 0) onRatio(item.url, width / height);
  };
  const bindVideo = (node: HTMLVideoElement | null) => {
    bind(node);
    bindVideoEl(node);
  };
  const mediaClassName = [
    'post-card-quote-thumb-media',
    resolved ? 'is-resolved' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      className="post-card-quote-thumb-cell"
      style={style}
      ref={containerRef}
    >
      {resolved ? null : (
        <span
          className="post-media-skeleton standing-row-shimmer"
          aria-hidden
        />
      )}
      {isVideo ? (
        // Poster gate: far-off quote thumbs unmount; the grid cell holds
        // the row height. Remounts warm a viewport before paint.
        videoMounted ? (
          <video
            ref={bindVideo}
            src={item.url}
            muted
            playsInline
            preload={videoPreload}
            className={mediaClassName}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              remember(video.videoWidth, video.videoHeight);
              markResolved();
            }}
            onError={markResolved}
          />
        ) : null
      ) : (
        <img
          ref={bind}
          src={ipfsImgVariantUrl(item.url, 384, item.mime) ?? item.url}
          alt=""
          className={mediaClassName}
          loading="lazy"
          decoding="async"
          onLoad={(event) => {
            const img = event.currentTarget;
            remember(img.naturalWidth, img.naturalHeight);
            markResolved();
          }}
          onError={markResolved}
        />
      )}
    </span>
  );
}

function QuoteMediaThumb({ items }: { items: PostMediaItem[] }) {
  const visible = items
    .filter((item) => !isRenderablePostAudioMime(item.mime))
    .slice(0, 4);
  const audioOnly =
    visible.length === 0 &&
    items.some((item) => isRenderablePostAudioMime(item.mime));
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const onRatio = useCallback((url: string, ratio: number) => {
    setRatios((current) =>
      current[url] === ratio ? current : { ...current, [url]: ratio }
    );
  }, []);
  const hero = collageHero(
    visible.length,
    visible.map((item) => ratios[item.url] ?? null)
  );
  const singleVideoUrl =
    visible.length === 1 && isRenderablePostVideoMime(visible[0]?.mime)
      ? visible[0].url
      : null;
  const [durationByUrl, setDurationByUrl] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const durationLabel =
    singleVideoUrl && durationByUrl?.url === singleVideoUrl
      ? durationByUrl.label
      : '';

  useEffect(() => {
    if (!singleVideoUrl) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (cancelled) return;
      setDurationByUrl({
        url: singleVideoUrl,
        label: formatMediaDuration(video.duration),
      });
    };
    video.onerror = () => {
      if (!cancelled) setDurationByUrl({ url: singleVideoUrl, label: '' });
    };
    video.src = singleVideoUrl;
    return () => {
      cancelled = true;
      video.removeAttribute('src');
      video.load();
    };
  }, [singleVideoUrl]);

  if (audioOnly) {
    return (
      <div
        className="post-card-quote-thumb post-card-quote-thumb--audio"
        aria-hidden
      >
        <PlayFillIcon className="post-card-quote-thumb-audio-icon" />
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div
      className={[
        'post-card-quote-thumb',
        visible.length > 1 ? `is-collage is-${visible.length}` : '',
        hero ? `is-${hero.mode}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {visible.map((item, index) => (
        <QuoteThumbTile
          key={`${item.cid ?? item.url}:${index}`}
          item={item}
          style={collageCellStyle(index, visible.length, hero)}
          onRatio={onRatio}
        />
      ))}
      {durationLabel ? (
        <span className="post-card-quote-thumb-duration">{durationLabel}</span>
      ) : null}
    </div>
  );
}
