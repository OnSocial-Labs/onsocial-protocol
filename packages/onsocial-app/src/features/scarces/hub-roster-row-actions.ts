import type { HubRosterRow } from '@/features/scarces/hub-roster';
import { accountIdsEqual } from '@/lib/account-match';

export type HubRosterRowActionId =
  | 'copy-handle'
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
}

export function hubRosterRowActions(
  row: HubRosterRow,
  context: HubRosterManageContext
): HubRosterRowAction[] {
  if (!context.viewerAccountId || row.role === 'owner') return [];
  if (accountIdsEqual(row.accountId, context.viewerAccountId)) return [];

  const actions: HubRosterRowAction[] = [];

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

export function hubRosterActionConfirmCopy(action: HubRosterRowAction): {
  title: string;
  subtitle: string;
  confirmLabel: string;
} {
  if (action.id === 'remove-moderator') {
    return {
      title: 'Remove moderator',
      subtitle: 'They lose hub management access.',
      confirmLabel: 'Remove moderator',
    };
  }
  return {
    title: 'Remove creator',
    subtitle: 'They cannot publish here unless approved again.',
    confirmLabel: 'Remove creator',
  };
}
