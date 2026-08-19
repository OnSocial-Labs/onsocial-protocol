'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
  }, [accountId, guildIds, guildNameById, myGuilds]);

  if (!accountId) {
    return null;
  }

  if (error) {
    return <p className="launcher-home-empty">{error}</p>;
  }

  if (myGuilds == null || pending) {
    return <p className="launcher-home-empty">Loading posts…</p>;
  }

  if (guildIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <p className="launcher-home-empty">Nothing new right now.</p>;
  }

  return (
    <ul className="launcher-peek-list" aria-label="Posts from your guilds">
      {peeks.map((peek) => (
        <li key={peek.key}>
          <Link href={peek.href} className="launcher-peek-row" scroll={false}>
            <span className="launcher-peek-row-copy">
              <span className="launcher-peek-row-title">{peek.label}</span>
              <span className="launcher-peek-row-meta">
                {peek.guildName}
                {peek.blockTimestamp > 0 ? (
                  <>
                    <span aria-hidden> · </span>
                    {formatRelativePostTimestamp(peek.blockTimestamp)}
                  </>
                ) : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
