'use client';

import { Suspense, useId, useMemo } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import dynamic from 'next/dynamic';
import type { PostRow } from '@onsocial/sdk';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

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
    hasMoreQuotes: false,
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
 * face so the film can scale with the grabber.
 */
export function FeedMediaThreadSheet({
  author,
  postId,
  initialRoot = null,
  band,
  gripHandlers,
}: {
  author: string;
  postId: string;
  initialRoot?: PostRow | null;
  band: number;
  gripHandlers: FeedThreadGripHandlers;
}) {
  const titleId = useId();
  const initial = useMemo(
    () => (initialRoot ? seedEmbeddedThread(initialRoot) : null),
    [initialRoot]
  );

  return (
    <div
      className="feed-photo-thread-sheet"
      role="dialog"
      aria-labelledby={titleId}
    >
      <div
        className="feed-photo-thread-grip"
        role="slider"
        tabIndex={0}
        aria-label="Resize thread"
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={92}
        aria-valuenow={Math.round(band * 100)}
        {...gripHandlers}
      >
        <span className="feed-photo-thread-grip-bar" aria-hidden />
      </div>
      <h2 id={titleId} className="sr-only">
        Post
      </h2>
      <div className="feed-photo-thread-body">
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
