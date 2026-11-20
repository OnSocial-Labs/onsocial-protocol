'use client';

import {
  Suspense,
  useCallback,
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
import { GlassSheet, SheetHeader } from '@onsocial/ui';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';
import { useFeedThreadBand } from '@/features/home/use-feed-thread-band';
import { scarceEmbedsForOpenRoot } from '@/features/scarces/scarce-embed-ledger';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

// Client panels; OsRouteSettle covers with thread skeleton until land.
const LivePersonalPostPanel = dynamic(
  () =>
    import('@/features/home/live-personal-post-panel').then(
      (mod) => mod.LivePersonalPostPanel
    ),
  { ssr: false }
);
const LiveGuildPostPanel = dynamic(
  () =>
    import('@/features/guilds/live-guild-post-panel').then(
      (mod) => mod.LiveGuildPostPanel
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

function seedEmbeddedGuildThread(root: PostRow): GuildPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    guildName: root.groupName ?? null,
    memberDriven: false,
    accessGated: false,
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
 * Bottom thread pane on the media enlarge face — same conversation as the
 * post page, without a second jacket. Guild roots use the guild panel (ACL /
 * channel); personal roots use the personal panel. Height is owned by the
 * face so the film can scale with the grabber.
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
  const groupId = initialRoot?.groupId?.trim() || '';
  const paintKey = groupId
    ? `${groupId}:${author}:${postId}`
    : `${author}:${postId}`;
  // Seeded root starts painted — match PostThreadSheet (appear is the motion).
  const [paintedForKey, setPaintedForKey] = useState<string | null>(() =>
    initialRoot ? paintKey : null
  );
  const threadPainted = paintedForKey === paintKey;
  const noteThreadPainted = useCallback(() => {
    setPaintedForKey(paintKey);
  }, [paintKey]);
  const personalInitial = useMemo(
    () =>
      initialRoot && !groupId ? seedEmbeddedThread(initialRoot) : null,
    [initialRoot, groupId]
  );
  const guildInitial = useMemo(
    () =>
      initialRoot && groupId ? seedEmbeddedGuildThread(initialRoot) : null,
    [initialRoot, groupId]
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
      <OsRouteSettle
        ready={threadPainted}
        skeleton={<PostThreadPageSkeleton />}
      >
        <Suspense fallback={null}>
          {groupId ? (
            <LiveGuildPostPanel
              groupId={groupId}
              author={author}
              postId={postId}
              initial={guildInitial}
              embedded
              hideRootMedia
              landSeat={false}
              onThreadPainted={noteThreadPainted}
            />
          ) : (
            <LivePersonalPostPanel
              author={author}
              postId={postId}
              initial={personalInitial}
              embedded
              hideRootMedia
              landSeat={false}
              onThreadPainted={noteThreadPainted}
            />
          )}
        </Suspense>
      </OsRouteSettle>
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
        key={`${author}:${postId}`}
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
