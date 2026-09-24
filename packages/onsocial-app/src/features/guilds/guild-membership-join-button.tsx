'use client';

import {
  OsActionDrawerConfirm,
  OsSheetAction,
  OsSheetActions,
  type OsSheetActionVariant,
} from '@onsocial/ui';
import { ActionDrawer } from '@/components/ui/action-drawer';
import {
  guildMembershipConfirmCopy,
  type GuildMembershipConfirmKind,
} from '@/features/guilds/guild-membership-action';

/**
 * Shared Join / Request / Joined / Leave control for guild page + guild post nav.
 * Callers own the membership state; this keeps chrome + labels consistent.
 */
export function GuildMembershipJoinButton({
  label,
  ready,
  active,
  pending,
  pendingLabel,
  disabled,
  className,
  variant = 'primary',
  onClick,
}: {
  label: string;
  ready: boolean;
  /** Selected wash for the Joined state (aria-pressed). */
  active?: boolean;
  pending: boolean;
  pendingLabel: string;
  disabled?: boolean;
  className?: string;
  variant?: OsSheetActionVariant;
  onClick: () => void;
}) {
  return (
    <OsSheetActions
      layout="row-compact"
      tone="frosted-primary"
      size="sm"
      borderless
      className={className}
    >
      <OsSheetAction
        type="button"
        className="guild-hero-action"
        variant={variant}
        ready={ready}
        active={active}
        pending={pending}
        pendingLabel={pendingLabel}
        disabled={disabled}
        onClick={onClick}
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
  isBlacklisted?: boolean;
  needsStorage?: boolean;
  loadGuild?: boolean;
  hintMember?: boolean;
  hintJoinPending?: boolean;
}): string {
  if (!args.isConnected) return 'Connect';
  if (args.loadGuild) return 'Load';
  if (args.isMember) return 'Joined';
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

/** Join, request, cancel, and leave confirm — same drawer as Delist. */
export function GuildMembershipConfirmDrawer({
  kind,
  guildName,
  pending,
  onConfirm,
  onCancel,
}: {
  kind: GuildMembershipConfirmKind | null;
  guildName?: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = kind ? guildMembershipConfirmCopy(kind) : null;

  return (
    <ActionDrawer
      open={kind !== null}
      onClose={pending ? () => undefined : onCancel}
      label={copy?.label ?? 'Guild'}
      copy={guildName}
      closeAriaLabel="Cancel"
      showClose={!pending}
    >
      {copy ? (
        <OsActionDrawerConfirm
          variant={copy.variant}
          confirmLabel={copy.confirmLabel}
          pending={pending}
          pendingLabel={copy.pendingLabel}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </ActionDrawer>
  );
}
