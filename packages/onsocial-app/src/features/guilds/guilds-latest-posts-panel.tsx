'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherPeekList,
  LauncherPeekRow,
} from '@/components/launcher-home';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  formatRelativePostTimestamp,
  parsePostText,
} from '@/lib/post-display';
import { postThreadPath } from '@/lib/post-routes';

const GUILD_FEED_LIMIT = 24;
const PEEK_LIMIT = 24;

export type GuildPostPeek = {
  key: string;
  groupId: string;
  guildName: string;
  author: string;
  postId: string;
  label: string;
  blockTimestamp: number;
  href: string;
};

/**
 * Membership-scoped post peeks under Guilds Home (one batched feed query).
 */
export function GuildsLatestPostsPanel({
  accountId,
  myGuilds,
}: {
  accountId: string | null;
  myGuilds: GuildSummaryCardModel[] | null;
}) {
  const [peeks, setPeeks] = useState<GuildPostPeek[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const guildIds = useMemo(() => {
    if (!myGuilds) return [];
    return myGuilds
      .map((row) => row.groupId.trim())
      .filter(Boolean)
      .slice(0, GUILD_FEED_LIMIT);
  }, [myGuilds]);

  const guildNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const guild of myGuilds ?? []) {
      map.set(guild.groupId, guildDisplayName(guild.name, guild.groupId));
    }
    return map;
  }, [myGuilds]);

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(false);
        setError(null);
      });
      return;
    }
    if (myGuilds == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
        setError(null);
      });
      return;
    }
    if (guildIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
        setError(null);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPending(true);
        setError(null);
      }
    });

    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const feed = await client.query.groups.feedFromGroups({
          groupIds: guildIds,
          limit: PEEK_LIMIT,
        });
        if (cancelled) return;
        const mapped = feed.items
          .map((post) => {
            const postId = post.postId?.trim();
            const author = post.accountId?.trim();
            const groupId = post.groupId?.trim();
            if (!postId || !author || !groupId) return null;
            const text = parsePostText(post.value ?? '').trim();
            const label = (
              text ||
              (post.kind ? String(post.kind) : '') ||
              `Post ${postId}`
            ).slice(0, 120);
            return {
              key: `${groupId}:${author}:${postId}`,
              groupId,
              guildName: guildNameById.get(groupId) ?? groupId,
              author,
              postId,
              label,
              blockTimestamp: Number(post.blockTimestamp) || 0,
              href: postThreadPath(post),
            } satisfies GuildPostPeek;
          })
          .filter((row): row is GuildPostPeek => row != null);
        setPeeks(mapped);
        setPending(false);
      } catch (cause) {
        if (cancelled) return;
        setPeeks(null);
        setPending(false);
        setError(
          cause instanceof Error ? cause.message : 'Could not load posts.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, guildIds, guildNameById, myGuilds, retryKey]);

  if (!accountId) {
    return null;
  }

  if (error) {
    return (
      <LauncherHomeError
        message={error}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (myGuilds == null || pending) {
    return <LauncherHomeEmpty>Loading posts…</LauncherHomeEmpty>;
  }

  if (guildIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <LauncherHomeEmpty>Nothing new right now.</LauncherHomeEmpty>;
  }

  return (
    <LauncherPeekList aria-label="Posts from your guilds">
      {peeks.map((peek) => (
        <LauncherPeekRow
          key={peek.key}
          href={peek.href}
          title={peek.label}
          meta={
            <>
              {peek.guildName}
              {peek.blockTimestamp > 0 ? (
                <>
                  <span aria-hidden> · </span>
                  {formatRelativePostTimestamp(peek.blockTimestamp)}
                </>
              ) : null}
            </>
          }
        />
      ))}
    </LauncherPeekList>
  );
}
