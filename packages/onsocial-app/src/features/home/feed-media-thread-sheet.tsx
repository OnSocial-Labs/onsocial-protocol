'use client';

import {
  Suspense,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import dynamic from 'next/dynamic';
import type { PostRow } from '@onsocial/sdk';
import {
  GLASS_SHEET_BACKDROP_BLUR_PX,
  GLASS_SHEET_BACKDROP_SATURATE,
  GLASS_SHEET_OS_PANEL_BLUR_PX,
  GLASS_SHEET_PANEL_SATURATE,
  SheetCloseButton,
  glassSheetBackdropFilterStyle,
  usePrefersReducedTransparency,
} from '@onsocial/ui';
import { useFeedThreadBand } from '@/features/home/use-feed-thread-band';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

const THREAD_SCRIM_EASE = 'cubic-bezier(0.2, 0.9, 0.24, 1)';
const THREAD_BLUR_MS = 320;

const LivePersonalPostPanel = dynamic(
  () =>
    import('@/features/home/live-personal-post-panel').then(
      (mod) => mod.LivePersonalPostPanel
    ),
  { ssr: false }
);

function seedEmbeddedThread(root: PostRow): PersonalPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    engagement: {},
    scarceEmbeds: {},
  };
}

export type FeedThreadGripHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

/**
 * Bottom thread pane on the media enlarge face — same conversation as
 * `/@account/posts/:id`, without a second jacket. Height is owned by the
 * face so the film can scale with the grabber. Chrome matches the hug
 * sheet (frost, scrim, grip, close under the grip) with no title row.
 * The scrim is clipped to this pane so the film above stays sharp.
 */
export function FeedMediaThreadSheet({
  author,
  postId,
  initialRoot = null,
  band,
  gripHandlers,
  onClose,
}: {
  author: string;
  postId: string;
  initialRoot?: PostRow | null;
  band: number;
  gripHandlers: FeedThreadGripHandlers;
  onClose: () => void;
}) {
  const titleId = useId();
  const reduceTransparency = usePrefersReducedTransparency();
  const [scrimIn, setScrimIn] = useState(false);
  const initial = useMemo(
    () => (initialRoot ? seedEmbeddedThread(initialRoot) : null),
    [initialRoot]
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => setScrimIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const scrimFilter = reduceTransparency
    ? 'blur(0px)'
    : `blur(calc(${GLASS_SHEET_BACKDROP_BLUR_PX}px * var(--feed-thread-cover, 1))) saturate(${GLASS_SHEET_BACKDROP_SATURATE})`;
  const frostFilter = reduceTransparency
    ? 'blur(0px)'
    : `blur(${GLASS_SHEET_OS_PANEL_BLUR_PX}px) saturate(${GLASS_SHEET_PANEL_SATURATE})`;
  const blurTransition = `opacity ${THREAD_BLUR_MS}ms ${THREAD_SCRIM_EASE}, backdrop-filter ${THREAD_BLUR_MS}ms ${THREAD_SCRIM_EASE}`;

  return (
    <div
      className={`feed-photo-thread-sheet${scrimIn ? ' is-in' : ''}`}
      role="dialog"
      aria-labelledby={titleId}
    >
      <div
        className="feed-photo-thread-scrim"
        aria-hidden
        style={glassSheetBackdropFilterStyle(scrimFilter)}
      />
      <div
        className="glass-sheet-frost"
        aria-hidden
        style={glassSheetBackdropFilterStyle(frostFilter, {
          transition: blurTransition,
        })}
      />
      <div
        className="feed-photo-thread-grip glass-sheet-drag"
        role="slider"
        tabIndex={0}
        aria-label="Resize thread"
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={92}
        aria-valuenow={Math.round(band * 100)}
        {...gripHandlers}
      >
        <span className="glass-sheet-grip" aria-hidden />
      </div>
      <header className="glass-sheet-header">
        <div className="glass-sheet-header-copy">
          <div className="glass-sheet-header-title-row">
            <SheetCloseButton ariaLabel="Close post" onClick={onClose} />
          </div>
        </div>
      </header>
      <h2 id={titleId} className="sr-only">
        Post
      </h2>
      <div className="feed-photo-thread-body os-hug-sheet-body">
        <Suspense fallback={null}>
          <LivePersonalPostPanel
            author={author}
            postId={postId}
            initial={initial}
            embedded
            hideRootMedia
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Reply thread over a reader. The page keeps scrolling underneath.
 * Drag the grip down to return to the same place.
 */
export function FeedFaceThreadPane({
  open,
  onDismiss,
  author,
  postId,
  initialRoot = null,
}: {
  open: boolean;
  onDismiss: () => void;
  author: string | null;
  postId: string | null;
  initialRoot?: PostRow | null;
}) {
  const { band, dragging, gripHandlers } = useFeedThreadBand(open, onDismiss);
  if (!open || !author || !postId) return null;
  return (
    <div
      className={`feed-face-thread-pane${dragging ? ' is-thread-dragging' : ''}`}
      style={
        {
          '--feed-thread-band': `${(band * 100).toFixed(1)}%`,
        } as CSSProperties
      }
    >
      <FeedMediaThreadSheet
        author={author}
        postId={postId}
        initialRoot={initialRoot}
        band={band}
        gripHandlers={gripHandlers}
        onClose={onDismiss}
      />
    </div>
  );
}
