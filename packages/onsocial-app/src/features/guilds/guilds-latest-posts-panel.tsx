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

const GUILD_FEED_LIMIT = 12;
const PEEK_PER_GUILD = 3;
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
 * Membership-scoped post peeks under Guilds Home.
 * Network catalog stays in Discover; this is activity across *your* guilds.
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
      map.set(
        guild.groupId,
        guildDisplayName(guild.name, guild.groupId)
      );
    }
    return map;
  }, [myGuilds]);

  useEffect(() => {
    if (!accountId) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(false);
      });
      return;
    }
    if (myGuilds == null) {
      queueMicrotask(() => {
        setPeeks(null);
        setPending(true);
      });
      return;
    }
    if (guildIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        setPending(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setPending(true);
    });

    void (async () => {
      const client = createReadOnlyOnSocialClient();
      const settled = await Promise.allSettled(
        guildIds.map(async (groupId) => {
          const feed = await client.query.groups.feed({
            groupId,
            limit: PEEK_PER_GUILD,
          });
          const guildName =
            guildNameById.get(groupId) ?? groupId;
          return feed.items
            .map((post) => {
              const postId = post.postId?.trim();
              const author = post.accountId?.trim();
              if (!postId || !author) return null;
              const text = parsePostText(post.value ?? '').trim();
              const label = (
                text ||
                (post.kind ? String(post.kind) : '') ||
                `Post ${postId}`
              ).slice(0, 120);
              return {
                key: `${groupId}:${author}:${postId}`,
                groupId,
                guildName,
                author,
                postId,
                label,
                blockTimestamp: Number(post.blockTimestamp) || 0,
                href: postThreadPath(post),
              } satisfies GuildPostPeek;
            })
            .filter((row): row is GuildPostPeek => row != null);
        })
      );

      if (cancelled) return;

      const merged: GuildPostPeek[] = [];
      for (const result of settled) {
        if (result.status === 'fulfilled') merged.push(...result.value);
      }
      merged.sort((a, b) => b.blockTimestamp - a.blockTimestamp);
      setPeeks(merged.slice(0, PEEK_LIMIT));
      setPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, guildIds, guildNameById, myGuilds]);

  if (!accountId) {
    return null;
  }

  if (myGuilds == null || pending) {
    return <p className="daos-index-empty">Loading posts…</p>;
  }

  if (guildIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <p className="daos-index-empty">Nothing new right now.</p>;
  }

  return (
    <ul className="daos-explore-list" aria-label="Posts from your guilds">
      {peeks.map((peek) => (
        <li key={peek.key}>
          <Link
            href={peek.href}
            className="daos-explore-row"
            scroll={false}
          >
            <span className="daos-explore-row-copy">
              <span className="daos-explore-row-title">{peek.label}</span>
              <span className="daos-explore-row-meta">
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
