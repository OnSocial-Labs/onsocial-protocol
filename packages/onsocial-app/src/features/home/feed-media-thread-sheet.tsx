'use client';

import {
  Suspense,
  useCallback,
  useId,
  useLayoutEffect,
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
import { GlassSheet, SheetHeader } from '@onsocial/ui';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import { useFeedThreadBand } from '@/features/home/use-feed-thread-band';
import { scarceEmbedsForOpenRoot } from '@/features/scarces/scarce-embed-ledger';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

// No loading skeleton — body stays opacity 0 until onThreadPainted.
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
    scarceEmbeds: scarceEmbedsForOpenRoot(root),
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
 * face so the film can scale with the grabber. Chrome is the shared
 * band sheet (frost, scrim, grip, close under the grip) with no title row.
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
  const paintKey = `${author}:${postId}`;
  const [paintedForKey, setPaintedForKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    setPaintedForKey(null);
  }, [paintKey]);
  const threadPainted = paintedForKey === paintKey;
  const noteThreadPainted = useCallback(() => {
    setPaintedForKey(paintKey);
  }, [paintKey]);
  const initial = useMemo(
    () => (initialRoot ? seedEmbeddedThread(initialRoot) : null),
    [initialRoot]
  );

  return (
    <GlassSheet
      open
      onClose={onClose}
      sizing="band"
      dragDismiss={false}
      keepDock
      ariaLabelledBy={titleId}
      backdropLabel="Close post"
      rootClassName="feed-photo-thread-sheet"
      panelClassName="feed-photo-thread-panel"
      bodyClassName="feed-photo-thread-body os-hug-sheet-body"
      header={
        <SheetHeader
          className="feed-photo-thread-header"
          titleId={titleId}
          title="Post"
          onClose={onClose}
          closeAriaLabel="Close post"
        />
      }
      grip={
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
      }
    >
      <OsPageBodyAppear ready={threadPainted}>
        <Suspense fallback={null}>
          <LivePersonalPostPanel
            author={author}
            postId={postId}
            initial={initial}
            embedded
            hideRootMedia
            landSeat={false}
            onThreadPainted={noteThreadPainted}
          />
        </Suspense>
      </OsPageBodyAppear>
    </GlassSheet>
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
