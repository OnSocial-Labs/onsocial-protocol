'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { SheetCloseButton } from '@onsocial/ui';
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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import { parsePostText } from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';
import {
  isRenderablePostAudioMime,
  isRenderablePostPlayableMime,
  isRenderablePostVideoMime,
  parsePostMedia,
  type PostMediaItem,
} from '@/lib/post-media';

const clientMountedSubscribe = () => () => {};
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;
const LIGHTBOX_EXIT_MS = 180;

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
  /** Sheet picker vs in-feed media slot. */
  variant?: 'sheet' | 'feed';
  /**
   * When set (feed medium shell), tap calls this instead of the zoom
   * lightbox. Sheet / list pickers keep expand-to-zoom.
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
  onActivate,
}: ScarcePostPreviewProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const [fallbackIssuedAt] = useState(() => Date.now());
  const useMediumActivate = Boolean(onActivate);
  const mounted = useSyncExternalStore(
    clientMountedSubscribe,
    getClientMountedSnapshot,
    getServerMountedSnapshot
  );
  const lightboxOpen = !useMediumActivate && expanded && !closing;
  const viewport = useVisualViewportSheetMetrics(
    !useMediumActivate && (expanded || closing)
  );
  useScrollLock(lightboxOpen);

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

  /** Pin the overlay to the visible viewport so a lingering keyboard cannot clip it. */
  const lightboxStyle = useMemo((): CSSProperties | undefined => {
    if (typeof window === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!viewport.isMobile || !vv || viewport.height <= 0) return undefined;
    return {
      top: vv.offsetTop,
      left: vv.offsetLeft,
      width: vv.width,
      height: vv.height,
      // Prefer visual viewport height over layout `dvh` while the keyboard is up.
      ['--scarce-lightbox-vh' as string]: `${viewport.height}px`,
    };
  }, [viewport.height, viewport.isMobile]);

  const requestClose = useCallback(() => {
    setClosing(true);
    setEntered(false);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setClosing(false);
      setExpanded(false);
      triggerRef.current?.focus();
    }, LIGHTBOX_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!lightboxOpen) return;
    // Dismiss the mobile keyboard before measuring / focusing chrome.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== closeRef.current &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable)
    ) {
      active.blur();
    }
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
      closeRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, requestClose]);

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

  const rasterSrc = listingCover ?? (isPhotoCard ? null : cover?.url) ?? null;
  const inlineSvg = textCardSvg ? inlineSvgMarkup(textCardSvg) : null;
  if (!rasterSrc && !inlineSvg) return null;
  const isPhotoCover = Boolean(rasterSrc);

  return (
    <>
      <button
        ref={triggerRef}
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
        aria-expanded={useMediumActivate ? undefined : lightboxOpen}
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
          setClosing(false);
          setEntered(false);
          setExpanded(true);
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

      {mounted && (expanded || closing)
        ? createPortal(
            <div
              ref={panelRef}
              className={`scarce-card-lightbox${entered && !closing ? ' is-open' : ''}${closing ? ' is-closing' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              style={lightboxStyle}
              onClick={requestClose}
            >
              <p id={titleId} className="sr-only">
                Card preview
              </p>
              <div className="scarce-card-lightbox-chrome">
                <SheetCloseButton
                  ref={closeRef}
                  onClick={requestClose}
                  ariaLabel="Close preview"
                  className="scarce-card-lightbox-close"
                />
              </div>
              {inlineSvg ? (
                <div
                  className="scarce-card-lightbox-asset scarce-card-lightbox-svg"
                  dangerouslySetInnerHTML={{ __html: inlineSvg }}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <img
                  key={rasterSrc!}
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
