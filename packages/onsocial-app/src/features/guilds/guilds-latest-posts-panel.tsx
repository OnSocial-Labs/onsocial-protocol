'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LauncherHomeEmpty,
  LauncherHomeError,
  LauncherSocialPeekList,
  LauncherSocialPeekRow,
  LauncherSocialPeekSkeleton,
  launcherPeekOverflowLabel,
  LAUNCHER_PEEK_DISPLAY_LIMIT,
} from '@/components/launcher-home';
import type { GuildSummaryCardModel } from '@/features/guilds/guild-summary-card';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useResolvedGroupPosts } from '@/hooks/use-quoted-posts';
import { APP_HOME_PATH } from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  resolveLauncherPostPeekDisplay,
  relationTargetAccountId,
} from '@/lib/launcher-post-peek';
import {
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';
import { isRepostRefType } from '@/lib/post-relation';
import { postThreadPath } from '@/lib/post-routes';
import {
  readLauncherLatestSession,
  writeLauncherLatestSession,
} from '@/lib/launcher-latest-session';

const GUILD_FEED_LIMIT = 24;
const PEEK_FETCH_LIMIT = 24;

export type GuildPostPeek = {
  key: string;
  groupId: string;
  guildName: string;
  author: string;
  postId: string;
  value: string;
  kind?: string | null;
  excerpt: string;
  blockTimestamp: number;
  href: string;
  refType?: string;
  refPath?: string;
  refAuthor?: string;
  parentPath?: string;
  parentAuthor?: string;
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
  const [peeks, setPeeks] = useState<GuildPostPeek[] | null>(() =>
    readLauncherLatestSession('guilds', accountId)
  );
  const [pending, setPending] = useState(peeks == null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const accountIdRef = useRef(accountId);
  const peeksRef = useRef(peeks);

  useEffect(() => {
    accountIdRef.current = accountId;
    peeksRef.current = peeks;
  }, [accountId, peeks]);

  useEffect(() => {
    return () => {
      writeLauncherLatestSession({
        kind: 'guilds',
        accountId: accountIdRef.current,
        items: peeksRef.current,
      });
    };
  }, []);

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
        const restored = readLauncherLatestSession<GuildPostPeek>(
          'guilds',
          accountId
        );
        setPeeks(restored);
        setPending(restored == null);
        setError(null);
      });
      return;
    }
    if (guildIds.length === 0) {
      queueMicrotask(() => {
        setPeeks([]);
        writeLauncherLatestSession({
          kind: 'guilds',
          accountId,
          items: [],
        });
        setPending(false);
        setError(null);
      });
      return;
    }

    let cancelled = false;
    const restored = readLauncherLatestSession<GuildPostPeek>(
      'guilds',
      accountId
    );
    queueMicrotask(() => {
      if (cancelled) return;
      setPeeks(restored);
      setPending(restored == null);
      setError(null);
    });

    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const feed = await client.query.groups.feedFromGroups({
          groupIds: guildIds,
          limit: PEEK_FETCH_LIMIT,
        });
        if (cancelled) return;
        const mapped: GuildPostPeek[] = [];
        for (const post of feed.items) {
          const postId = post.postId?.trim();
          const author = post.accountId?.trim();
          const groupId = post.groupId?.trim();
          if (!postId || !author || !groupId) continue;
          const value = post.value ?? '';
          mapped.push({
            key: `${groupId}:${author}:${postId}`,
            groupId,
            guildName: guildNameById.get(groupId) ?? groupId,
            author,
            postId,
            value,
            kind: post.kind ?? null,
            excerpt: '',
            blockTimestamp: Number(post.blockTimestamp) || 0,
            href: postThreadPath(post),
            refType: post.refType,
            refPath: post.refPath,
            refAuthor: post.refAuthor,
            parentPath: post.parentPath,
            parentAuthor: post.parentAuthor,
          });
        }
        setPeeks(mapped);
        writeLauncherLatestSession({
          kind: 'guilds',
          accountId,
          items: mapped,
        });
        setPending(false);
        setError(null);
      } catch (cause) {
        if (cancelled) return;
        setPending(false);
        if (peeksRef.current != null) return;
        setPeeks(null);
        setError(
          cause instanceof Error ? cause.message : 'Could not load posts.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, guildIds, guildNameById, myGuilds, retryKey]);

  const visiblePeeks = useMemo(
    () => (peeks ?? []).slice(0, LAUNCHER_PEEK_DISPLAY_LIMIT),
    [peeks]
  );

  const repostRefPaths = useMemo(
    () =>
      visiblePeeks
        .filter((peek) => isRepostRefType(peek.refType) && peek.refPath)
        .map((peek) => peek.refPath),
    [visiblePeeks]
  );
  const resolvedPosts = useResolvedGroupPosts(repostRefPaths);

  const authorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const peek of visiblePeeks) {
      ids.add(peek.author);
      const targetId = relationTargetAccountId(peek);
      if (targetId) ids.add(targetId);
      const original =
        peek.refPath && isRepostRefType(peek.refType)
          ? resolvedPosts[peek.refPath]
          : undefined;
      if (original?.accountId) ids.add(original.accountId);
    }
    return [...ids];
  }, [resolvedPosts, visiblePeeks]);

  const authorProfiles = usePostAuthorProfiles(authorIds);
  const overflowLabel = launcherPeekOverflowLabel(
    peeks?.length ?? 0,
    'home',
    LAUNCHER_PEEK_DISPLAY_LIMIT
  );

  if (!accountId) {
    return null;
  }

  if (error && peeks == null) {
    return (
      <LauncherHomeError
        message={error}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    );
  }

  if (peeks == null && (myGuilds == null || pending)) {
    return <LauncherSocialPeekSkeleton count={5} />;
  }

  if (guildIds.length === 0) {
    return null;
  }

  if (!peeks || peeks.length === 0) {
    return <LauncherHomeEmpty>Nothing new right now.</LauncherHomeEmpty>;
  }

  return (
    <LauncherSocialPeekList
      aria-label="Latest posts from your guilds"
      footer={
        overflowLabel ? (
          <p className="launcher-home-more">
            <Link
              href={APP_HOME_PATH}
              className="launcher-home-inline-link"
              scroll={false}
            >
              {overflowLabel}
            </Link>
          </p>
        ) : null
      }
    >
      {visiblePeeks.map((peek, index) => {
        const display = resolveLauncherPostPeekDisplay({
          peek,
          resolvedByPath: resolvedPosts,
          viewerAccountId: accountId,
          authorDisplayName: authorProfiles[peek.author]?.displayName,
        });
        const profile = authorProfiles[display.accountId];
        const relationTargetId = display.relation
          ? relationTargetAccountId(peek)
          : null;
        const timeLabel =
          peek.blockTimestamp > 0
            ? formatRelativePostTimestamp(peek.blockTimestamp)
            : null;

        return (
          <LauncherSocialPeekRow
            key={peek.key}
            href={display.href}
            accountId={display.accountId}
            profileName={profile?.displayName}
            avatarUrl={profile?.avatarUrl}
            contextLabel={peek.guildName}
            timeLabel={timeLabel}
            timeTitle={postTimestampIso(peek.blockTimestamp) ?? undefined}
            excerpt={display.excerpt}
            relation={display.relation}
            repostAttribution={display.repostAttribution}
            relationTargetProfileName={
              relationTargetId
                ? authorProfiles[relationTargetId]?.displayName
                : undefined
            }
            showDivider={index > 0}
          />
        );
      })}
    </LauncherSocialPeekList>
  );
}
