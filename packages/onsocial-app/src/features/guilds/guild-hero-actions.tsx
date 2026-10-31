'use client';

import { SettingsIcon, UserMinusIcon, UserPlusIcon } from '@onsocial/ui';
import { formatProfileCount } from '@/lib/profile-social-standings';

export interface GuildHeroActionVisibility {
  showJoin: boolean;
  showLeave: boolean;
  showSettings: boolean;
}

/**
 * Hero icon row. Plus is join, minus is leave, gear is settings.
 * No text. Owners do not get leave. The gear follows who can open settings.
 */
export function guildHeroActionVisibility(args: {
  isMember?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  hintMember?: boolean;
  canOpenSettings?: boolean;
}): GuildHeroActionVisibility {
  const joined = Boolean(args.isMember || args.hintMember);
  return {
    showJoin: !joined,
    showLeave: joined && !args.isOwner,
    showSettings: Boolean(args.canOpenSettings),
  };
}

/** Banner-sized Magi icons beside the guild facepile. Join text stays off. */
export function GuildHeroActions({
  showJoin,
  showLeave,
  showSettings,
  joinDisabled = false,
  pending = false,
  requestCount = 0,
  onJoin,
  onLeave,
  onOpenSettings,
}: GuildHeroActionVisibility & {
  joinDisabled?: boolean;
  /** Joining or leaving — progress cursor, click held. */
  pending?: boolean;
  /** Pending join requests. Candy badge on the gear when this is above zero. */
  requestCount?: number;
  onJoin: () => void;
  onLeave: () => void;
  onOpenSettings: () => void;
}) {
  if (!showJoin && !showLeave && !showSettings) return null;

  return (
    <div className="guild-hero-actions">
      {showJoin ? (
        <button
          type="button"
          className={`guild-hero-action-icon${pending ? ' is-pending' : ''}`}
          aria-label="Join guild"
          aria-busy={pending || undefined}
          disabled={joinDisabled || pending}
          onClick={onJoin}
        >
          <UserPlusIcon className="glass-sheet-close-icon" aria-hidden />
        </button>
      ) : null}
      {showLeave ? (
        <button
          type="button"
          className={`guild-hero-action-icon${pending ? ' is-pending' : ''}`}
          aria-label="Leave guild"
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={onLeave}
        >
          <UserMinusIcon className="glass-sheet-close-icon" aria-hidden />
        </button>
      ) : null}
      {showSettings ? (
        <button
          type="button"
          className={`guild-hero-action-icon${
            requestCount > 0 ? ' has-badge' : ''
          }`}
          aria-label={
            requestCount > 0
              ? `Guild settings, ${requestCount} pending requests`
              : 'Guild settings'
          }
          onClick={onOpenSettings}
        >
          <SettingsIcon className="glass-sheet-close-icon" aria-hidden />
          {requestCount > 0 ? (
            <span className="guild-manage-menu-badge" aria-hidden>
              {formatProfileCount(requestCount)}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
