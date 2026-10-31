'use client';

import { SettingsIcon, UserMinusIcon, UserPlusIcon } from '@onsocial/ui';

export interface GuildHeroActionVisibility {
  showJoin: boolean;
  showLeave: boolean;
  showSettings: boolean;
}

/**
 * Hero icon row. Plus is join, minus is leave, gear is settings.
 * No text. Owners do not get leave.
 */
export function guildHeroActionVisibility(args: {
  isMember?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  hintMember?: boolean;
}): GuildHeroActionVisibility {
  const joined = Boolean(args.isMember || args.hintMember);
  const canConfigure = Boolean(args.isOwner || args.isAdmin);
  return {
    showJoin: !joined,
    showLeave: joined && !args.isOwner,
    showSettings: canConfigure,
  };
}

/** Banner-sized Magi icons beside the guild facepile. Join text stays off. */
export function GuildHeroActions({
  showJoin,
  showLeave,
  showSettings,
  joinDisabled = false,
  pending = false,
  onJoin,
  onLeave,
  onOpenSettings,
}: GuildHeroActionVisibility & {
  joinDisabled?: boolean;
  /** Joining or leaving — progress cursor, click held. */
  pending?: boolean;
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
          className="guild-hero-action-icon"
          aria-label="Guild settings"
          onClick={onOpenSettings}
        >
          <SettingsIcon className="glass-sheet-close-icon" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
