'use client';

import { ProfileAvatar } from '@onsocial/ui';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';

/** Default overlapped avatar slots — keep in sync with `.guild-facepile-avatars--slots`. */
export const GUILD_FACEPILE_SLOTS = 3;

export function buildGuildFacepileIds(
  memberIds: string[],
  opts?: { viewerId?: string | null; viewerIsMember?: boolean }
): string[] {
  const ids = [...memberIds];
  const viewerId = opts?.viewerId?.trim();
  if (opts?.viewerIsMember && viewerId && !ids.includes(viewerId)) {
    ids.unshift(viewerId);
  }
  return ids;
}

export function GuildFacepile({
  memberIds,
  profiles,
  memberCount,
  countUnit = { one: 'member', other: 'members' },
  loading = false,
  slots = GUILD_FACEPILE_SLOTS,
  showCount = true,
  onClick,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: {
  memberIds: string[];
  profiles: Record<string, PostAuthorProfile>;
  memberCount?: number | null;
  /** Singular / plural for the count label — hubs pass creator(s). */
  countUnit?: { one: string; other: string };
  loading?: boolean;
  slots?: number;
  showCount?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const maxSlots = Math.max(1, slots);
  const ids = memberIds.slice(0, maxSlots);
  // Width tracks filled avatars (or shimmer count while loading) — no empty
  // reserved slots that push the count label away.
  const renderSlots = loading
    ? Math.min(
        maxSlots,
        Math.max(1, memberCount && memberCount > 0 ? memberCount : maxSlots)
      )
    : ids.length;

  const countLabel =
    memberCount == null
      ? null
      : `${memberCount} ${
          memberCount === 1 ? countUnit.one : countUnit.other
        }`;

  const resolvedAria =
    ariaLabel ??
    (loading
      ? `Loading ${countUnit.other}`
      : countLabel
        ? `${countLabel}. View roster.`
        : `View ${countUnit.other}`);

  const classes = `guild-facepile guild-facepile--stable${
    className ? ` ${className}` : ''
  }`;
  const avatarsStyle =
    renderSlots > 0
      ? {
          ['--guild-facepile-slot-count' as string]: String(renderSlots),
        }
      : undefined;

  const body = (
    <>
      {renderSlots > 0 ? (
        <span
          className="guild-facepile-avatars guild-facepile-avatars--slots"
          style={avatarsStyle}
          aria-hidden
        >
          {loading
            ? Array.from({ length: renderSlots }, (_, i) => (
                <span
                  key={i}
                  className="standing-row-shimmer guild-facepile-avatar-shimmer"
                />
              ))
            : ids.map((memberId) => (
                <ProfileAvatar
                  key={memberId}
                  src={profiles[memberId]?.avatarUrl ?? null}
                  fallbackInitial={
                    profiles[memberId]?.displayName ?? memberId
                  }
                  size="sm"
                  className="guild-facepile-avatar"
                />
              ))}
        </span>
      ) : null}
      {showCount ? (
        <span
          className={`guild-facepile-count${
            loading ? ' guild-facepile-count--slot' : ''
          }`}
        >
          {loading ? (
            <span
              className="standing-row-shimmer guild-facepile-count-shimmer"
              aria-hidden
            />
          ) : (
            countLabel
          )}
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-label={resolvedAria}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }

  return (
    <span className={classes} aria-hidden={ariaLabel ? undefined : true}>
      {body}
    </span>
  );
}
