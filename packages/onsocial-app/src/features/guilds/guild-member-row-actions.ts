import type { GroupMemberRow } from '@onsocial/sdk';
import {
  guildMemberRoleBucket,
  type GuildMemberRoleBucket,
} from '@/features/guilds/guild-member-filter';

export type GuildMemberRowActionId =
  | 'make-mod'
  | 'demote-to-mod'
  | 'remove-mod'
  | 'make-admin'
  | 'remove-admin'
  | 'make-member'
  | 'transfer-ownership'
  | 'remove-from-guild'
  | 'ban-from-guild'
  | 'unban-from-guild'
  | 'copy-handle';

export interface GuildMemberRowAction {
  id: GuildMemberRowActionId;
  label: string;
  destructive?: boolean;
  propose?: boolean;
}

export interface GuildMembersManageContext {
  viewerAccountId: string | null;
  viewerIsOwner: boolean;
  viewerIsAdmin: boolean;
  memberDriven: boolean;
}

export function canViewerManageGuildMembers(
  context: GuildMembersManageContext
): boolean {
  return context.viewerIsOwner || context.viewerIsAdmin;
}

function actionLabel(
  context: GuildMembersManageContext,
  label: string,
  propose = false
): string {
  if (!propose && !context.memberDriven) return label;
  if (context.memberDriven && propose) return `Propose: ${label}`;
  return label;
}

function removeFromGuildAction(
  context: GuildMembersManageContext
): GuildMemberRowAction {
  return {
    id: 'remove-from-guild',
    label: context.memberDriven
      ? 'Propose removal'
      : 'Remove from guild',
    destructive: true,
    propose: context.memberDriven,
  };
}

function banFromGuildAction(
  context: GuildMembersManageContext
): GuildMemberRowAction {
  return {
    id: 'ban-from-guild',
    label: context.memberDriven ? 'Propose ban' : 'Ban from guild',
    destructive: true,
    propose: context.memberDriven,
  };
}

export function guildBannedMemberRowActions(
  memberId: string,
  context: GuildMembersManageContext
): GuildMemberRowAction[] {
  if (!context.viewerAccountId || !canViewerManageGuildMembers(context)) {
    return [];
  }
  if (memberId === context.viewerAccountId) return [];

  return [
    {
      id: 'unban-from-guild',
      label: context.memberDriven ? 'Propose unban' : 'Unban',
      propose: context.memberDriven,
    },
    { id: 'copy-handle', label: 'Copy @handle' },
  ];
}

function transferOwnershipAction(
  context: GuildMembersManageContext
): GuildMemberRowAction {
  return {
    id: 'transfer-ownership',
    label: actionLabel(context, 'Transfer ownership', true),
    propose: context.memberDriven,
    destructive: true,
  };
}

function roleActionsForBucket(
  bucket: GuildMemberRoleBucket,
  context: GuildMembersManageContext
): GuildMemberRowAction[] {
  if (bucket === 'owner') return [];

  const transferAction = context.viewerIsOwner
    ? [transferOwnershipAction(context)]
    : [];

  if (bucket === 'admin') {
    const actions: GuildMemberRowAction[] = [...transferAction];
    if (context.viewerIsOwner) {
      actions.push({
        id: 'demote-to-mod',
        label: actionLabel(context, 'Move to mod team', true),
        propose: context.memberDriven,
      });
      actions.push({
        id: 'remove-admin',
        label: actionLabel(context, 'Remove admin role', true),
        propose: context.memberDriven,
      });
    }
    actions.push(removeFromGuildAction(context));
    actions.push(banFromGuildAction(context));
    return actions;
  }

  if (bucket === 'moderator') {
    const actions: GuildMemberRowAction[] = [...transferAction];
    if (context.viewerIsOwner) {
      actions.push({
        id: 'make-admin',
        label: actionLabel(context, 'Add to admin team', true),
        propose: context.memberDriven,
      });
    }
    actions.push({
      id: 'remove-mod',
      label: actionLabel(context, 'Remove mod role', true),
      propose: context.memberDriven,
    });
    actions.push({
      id: 'make-member',
      label: actionLabel(context, 'Make regular member', true),
      propose: context.memberDriven,
    });
    actions.push(removeFromGuildAction(context));
    actions.push(banFromGuildAction(context));
    return actions;
  }

  const actions: GuildMemberRowAction[] = [
    ...transferAction,
    {
      id: 'make-mod',
      label: actionLabel(context, 'Add to mod team', true),
      propose: context.memberDriven,
    },
  ];
  if (context.viewerIsOwner) {
    actions.push({
      id: 'make-admin',
      label: actionLabel(context, 'Add to admin team', true),
      propose: context.memberDriven,
    });
  }
  actions.push(removeFromGuildAction(context));
  actions.push(banFromGuildAction(context));
  return actions;
}

export function guildMemberRowActions(
  member: GroupMemberRow,
  context: GuildMembersManageContext
): GuildMemberRowAction[] {
  if (!context.viewerAccountId || !canViewerManageGuildMembers(context)) {
    return [];
  }

  if (member.memberId === context.viewerAccountId) {
    if (member.isOwner && context.viewerIsOwner) {
      return [{ id: 'copy-handle', label: 'Copy @handle' }];
    }
    return [];
  }

  const bucket = guildMemberRoleBucket(member);
  if (bucket === 'owner') return [];
  if (bucket === 'admin' && !context.viewerIsOwner) return [];

  return [
    ...roleActionsForBucket(bucket, context),
    { id: 'copy-handle', label: 'Copy @handle' },
  ];
}

const CONFIRM_SUBTITLES: Partial<
  Record<GuildMemberRowActionId, { title: string; subtitle: string }>
> = {
  'make-mod': {
    title: 'Add to mod team',
    subtitle: 'They can moderate posts and help manage members.',
  },
  'demote-to-mod': {
    title: 'Move to mod team',
    subtitle: 'They will lose admin access but keep moderation permissions.',
  },
  'remove-mod': {
    title: 'Remove mod role',
    subtitle: 'They will become a regular member.',
  },
  'make-admin': {
    title: 'Add to admin team',
    subtitle: 'They can manage members and guild settings.',
  },
  'remove-admin': {
    title: 'Remove admin role',
    subtitle: 'They will become a regular member.',
  },
  'make-member': {
    title: 'Make regular member',
    subtitle: 'They will lose mod permissions.',
  },
  'transfer-ownership': {
    title: 'Transfer ownership',
    subtitle:
      'They become guild owner. Choose whether you stay as a member or leave the guild.',
  },
  'remove-from-guild': {
    title: 'Remove from guild',
    subtitle: 'They will lose access to this guild.',
  },
  'ban-from-guild': {
    title: 'Ban from guild',
    subtitle:
      'They are removed and cannot rejoin until unbanned.',
  },
  'unban-from-guild': {
    title: 'Unban member',
    subtitle: 'They can request to join again. Membership is not restored.',
  },
};

export function guildMemberActionConfirmCopy(action: GuildMemberRowAction): {
  title: string;
  subtitle: string;
  confirmLabel: string;
} {
  const copy = CONFIRM_SUBTITLES[action.id];
  if (!copy) {
    throw new Error(`Unsupported guild member confirm action: ${action.id}`);
  }

  const title = copy.title;
  const subtitle =
    action.id === 'transfer-ownership' && action.propose
      ? `Members must vote before this takes effect. ${copy.subtitle}`
      : action.propose &&
          (action.id === 'remove-from-guild' ||
            action.id === 'ban-from-guild' ||
            action.id === 'unban-from-guild')
        ? `Members must vote before this takes effect. ${copy.subtitle}`
        : action.propose
          ? `Members must vote before this role takes effect. ${copy.subtitle}`
          : copy.subtitle;
  const confirmLabel = action.propose
    ? 'Submit proposal'
    : action.id === 'remove-from-guild'
      ? 'Remove member'
      : action.id === 'ban-from-guild'
        ? 'Ban member'
        : action.id === 'unban-from-guild'
          ? 'Unban'
          : action.id === 'transfer-ownership'
            ? 'Transfer ownership'
            : copy.title;

  return { title, subtitle, confirmLabel };
}
