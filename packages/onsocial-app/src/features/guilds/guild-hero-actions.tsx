'use client';

import { SettingsIcon, UserMinusIcon, UserPlusIcon } from '@onsocial/ui';
import { formatProfileCount } from '@/lib/profile-social-standings';

export interface GuildHeroActionVisibility {
  showJoin: boolean;
  showLeave: boolean;
  showSettings: boolean;
}

/** Indexed guild owner. The chain role view can arrive after the shell. */
export function guildViewerOwnsShell(
  accountId: string | null | undefined,
  ownerId: string | null | undefined
): boolean {
  const account = accountId?.trim().toLowerCase() ?? '';
  const owner = ownerId?.trim().toLowerCase() ?? '';
  return account.length > 0 && account === owner;
}

/**
 * Leave follows the same owner the members list badges.
 * Icons stay blank until that owner id is known, so a member hint cannot
 * paint the minus and then swap it for the gear. A chain `isOwner` flag
 * never hides Leave.
 */
export function guildHeroIconsForViewer(input: {
  accountId?: string | null;
  ownerId?: string | null;
  isMember: boolean;
  /** Ignored. A chain role flag must not decide the hero icons. */
  chainIsOwner?: boolean;
  /** Ignored. Icons wait on the roster owner, not this flag. */
  accessResolved?: boolean;
  canOpenSettings?: boolean;
}): GuildHeroActionVisibility {
  const signedIn = Boolean(input.accountId?.trim());
  const shellKnown = Boolean(input.ownerId?.trim() && signedIn);
  const isOwner =
    shellKnown && guildViewerOwnsShell(input.accountId, input.ownerId);
  return guildHeroActionVisibility({
    isMember: input.isMember,
    isOwner,
    canOpenSettings:
      shellKnown && (Boolean(input.canOpenSettings) || isOwner),
    roleKnown: !signedIn || shellKnown,
  });
}

/**
 * Hero icon row. Plus is join, minus is leave, gear is settings.
 * No text. Owners do not get leave. The gear follows who can open settings.
 * Leave stays hidden until the role is known, so a member hint cannot flash
 * the leave icon for the owner.
 */
export function guildHeroActionVisibility(args: {
  isMember?: boolean;
  isOwner?: boolean;
  isAdmin?: boolean;
  hintMember?: boolean;
  canOpenSettings?: boolean;
  /** False while this member might still be the owner. */
  roleKnown?: boolean;
}): GuildHeroActionVisibility {
  const joined = Boolean(args.isMember || args.hintMember);
  const roleKnown = args.roleKnown !== false;
  return {
    showJoin: !joined,
    showLeave: joined && roleKnown && !args.isOwner,
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
