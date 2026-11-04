import type { HubRosterRow } from '@/features/scarces/hub-roster';
import { accountIdsEqual } from '@/lib/account-match';

export type HubRosterRowActionId =
  | 'copy-handle'
  | 'transfer-ownership'
  | 'make-moderator'
  | 'make-creator'
  | 'remove-moderator'
  | 'remove-creator';

export interface HubRosterRowAction {
  id: HubRosterRowActionId;
  label: string;
  destructive?: boolean;
}

export interface HubRosterManageContext {
  viewerAccountId: string | null;
  canManageModerators: boolean;
  canManageCreators: boolean;
  /** Approval / invite hubs — creator roster seat moves. */
  showCreatorRoster: boolean;
}

export function buildHubRosterManageContext(
  viewerAccountId: string | null | undefined,
  canManageModerators: boolean,
  canManageCreators: boolean,
  showCreatorRoster: boolean
): HubRosterManageContext | null {
  const viewer = viewerAccountId?.trim() || null;
  if (!viewer || (!canManageModerators && !canManageCreators)) {
    return null;
  }
  return {
    viewerAccountId: viewer,
    canManageModerators,
    canManageCreators,
    showCreatorRoster,
  };
}

export function hubRosterRowActions(
  row: HubRosterRow,
  context: HubRosterManageContext
): HubRosterRowAction[] {
  if (!context.viewerAccountId || row.role === 'owner') return [];
  if (accountIdsEqual(row.accountId, context.viewerAccountId)) return [];

  const actions: HubRosterRowAction[] = [];

  if (context.canManageModerators) {
    actions.push({
      id: 'transfer-ownership',
      label: 'Transfer hub',
      destructive: true,
    });
  }

  if (row.role === 'approved_creator' && context.canManageModerators) {
    actions.push({
      id: 'make-moderator',
      label: 'Move to moderators',
    });
  }
  if (
    row.role === 'moderator' &&
    context.canManageModerators &&
    context.showCreatorRoster
  ) {
    actions.push({
      id: 'make-creator',
      label: 'Move to creators',
    });
  }

  if (row.role === 'moderator' && context.canManageModerators) {
    actions.push({
      id: 'remove-moderator',
      label: 'Remove moderator',
      destructive: true,
    });
  }
  if (row.role === 'approved_creator' && context.canManageCreators) {
    actions.push({
      id: 'remove-creator',
      label: 'Remove creator',
      destructive: true,
    });
  }

  if (actions.length === 0) return [];

  actions.push({ id: 'copy-handle', label: 'Copy handle' });
  return actions;
}

export function hubRosterActionConfirmCopy(
  action: HubRosterRowAction,
  context: Pick<HubRosterManageContext, 'showCreatorRoster'>
): {
  title: string;
  subtitle: string;
  confirmLabel: string;
} {
  if (action.id === 'remove-moderator') {
    return {
      title: 'Remove moderator',
      // Open: anyone can still publish. Approval/invite: mod seat was their publish path.
      subtitle: context.showCreatorRoster
        ? 'Loses management and publish access.'
        : 'Loses hub management.',
      confirmLabel: 'Remove moderator',
    };
  }
  if (action.id === 'make-moderator') {
    return {
      title: 'Move to moderators',
      subtitle: 'Hub management and publish. Leaves creators.',
      confirmLabel: 'Move to moderators',
    };
  }
  if (action.id === 'make-creator') {
    return {
      title: 'Move to creators',
      subtitle: 'Keeps publish. Leaves moderators.',
      confirmLabel: 'Move to creators',
    };
  }
  return {
    title: 'Remove creator',
    subtitle: 'Loses publish access.',
    confirmLabel: 'Remove creator',
  };
}
