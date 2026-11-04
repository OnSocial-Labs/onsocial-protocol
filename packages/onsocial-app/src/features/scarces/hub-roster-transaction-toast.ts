import type { HubRosterRowActionId } from '@/features/scarces/hub-roster-row-actions';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

export type HubRosterMutationKind = 'moderator' | 'creator';

export function hubRosterTransactionToast(kind: HubRosterMutationKind): {
  confirming: string;
  success: string;
  failure: string;
} {
  if (kind === 'moderator') {
    return {
      confirming: txToastConfirming.updatingAppModerators,
      success: txToastSuccess.appModeratorsUpdated,
      failure: txToastError.updateAppModeratorsFailed,
    };
  }
  return {
    confirming: txToastConfirming.updatingAppCreators,
    success: txToastSuccess.appCreatorsUpdated,
    failure: txToastError.updateAppCreatorsFailed,
  };
}

export function hubRosterTransactionToastForAction(
  actionId: HubRosterRowActionId
): {
  confirming: string;
  success: string;
  failure: string;
} {
  if (actionId === 'remove-moderator' || actionId === 'make-moderator') {
    return hubRosterTransactionToast('moderator');
  }
  return hubRosterTransactionToast('creator');
}
