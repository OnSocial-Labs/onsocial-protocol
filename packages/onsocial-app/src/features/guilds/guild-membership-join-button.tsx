'use client';

import type { FocusEventHandler } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  type OsSheetActionVariant,
} from '@onsocial/ui';

/**
 * Shared Join / Request / Joined / Leave control for guild page + guild post nav.
 * Callers own the membership state; this keeps chrome + labels consistent.
 */
export function GuildMembershipJoinButton({
  label,
  ready,
  pending,
  pendingLabel,
  disabled,
  className,
  variant = 'primary',
  onClick,
  onBlur,
}: {
  label: string;
  ready: boolean;
  pending: boolean;
  pendingLabel: string;
  disabled?: boolean;
  className?: string;
  variant?: OsSheetActionVariant;
  onClick: () => void;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}) {
  return (
    <OsSheetActions
      layout="row-compact"
      tone="frosted-primary"
      borderless
      className={className}
    >
      <OsSheetAction
        type="button"
        className="guild-hero-action"
        variant={variant}
        ready={ready}
        pending={pending}
        pendingLabel={pendingLabel}
        disabled={disabled}
        onClick={onClick}
        onBlur={onBlur}
      >
        {label}
      </OsSheetAction>
    </OsSheetActions>
  );
}

export function guildMembershipJoinLabel(args: {
  isConnected: boolean;
  accessGated: boolean;
  joinPending: boolean;
  joinCancelReady?: boolean;
  isMember?: boolean;
  isOwner?: boolean;
  isBlacklisted?: boolean;
  confirmingLeave?: boolean;
  needsStorage?: boolean;
  loadGuild?: boolean;
  hintMember?: boolean;
  hintJoinPending?: boolean;
}): string {
  if (!args.isConnected) return 'Connect';
  if (args.loadGuild) return 'Load';
  if (args.isMember) {
    if (!args.confirmingLeave) return 'Joined';
    return args.isOwner ? 'Transfer?' : 'Leave?';
  }
  if (args.hintMember) return 'Joined';
  if (args.isBlacklisted) return 'Banned';
  if (args.hintJoinPending || (args.joinPending && !args.joinCancelReady)) {
    return 'Pending';
  }
  if (args.joinPending && args.joinCancelReady) return 'Cancel';
  if (args.needsStorage) return 'Storage';
  return args.accessGated ? 'Request' : 'Join';
}

export function guildMembershipJoinPendingLabel(args: {
  accessGated: boolean;
  canceling?: boolean;
  leaving?: boolean;
}): string {
  if (args.leaving) return 'Leaving…';
  if (args.canceling) return 'Cancel…';
  return args.accessGated ? 'Request…' : 'Joining…';
}
