import type {
  GovernanceDaoPolicy,
  GovernanceDaoRole,
} from '@/features/governance/types';
import {
  getAddRoleAccessBlockReason,
  getRemoveDaoPolicyRoleBlockReason,
  type DaoAddRoleAccessMode,
  type DaoPolicyActionId,
} from '@/features/governance/governance-proposal-builders';
import {
  isProposalBondWithinMax,
  isProposalPeriodDaysWithinMax,
  MAX_PROPOSAL_BOND_NEAR,
  MAX_PROPOSAL_PERIOD_DAYS,
  MAX_PROPOSER_THRESHOLD_SOCIAL,
  MIN_PROPOSER_THRESHOLD_SOCIAL,
} from '@/lib/near-rpc';
import { portalConnectMessage } from '@/lib/portal-connect-copy';

export type PolicyFieldHintId =
  | 'newRoleName'
  | 'addRoleAccess'
  | 'addRolePermissions'
  | 'memberThreshold'
  | 'permissions'
  | 'bond'
  | 'period'
  | 'configName'
  | 'configPurpose'
  | 'voteThreshold'
  | 'removeRole';

export type PolicyFieldHints = Partial<Record<PolicyFieldHintId, string>>;

export function resolveNewRoleNameFieldHint(input: {
  newRoleName: string;
  normalizedNewRoleName: string | null;
  roleExists: boolean;
  submitAttempted: boolean;
}): string | null {
  if (input.roleExists && input.normalizedNewRoleName) {
    return `Role ${input.normalizedNewRoleName} already exists.`;
  }

  if (input.normalizedNewRoleName) {
    return null;
  }

  if (!input.newRoleName.trim()) {
    return input.submitAttempted ? 'Role name required.' : null;
  }

  return 'Use lowercase letters, numbers, underscores.';
}

export function resolvePolicyFormValidation(input: {
  isConnected: boolean;
  canEditPolicy: boolean;
  canProposeSelectedPolicyAction: boolean;
  canCoverBond: boolean;
  bondDisplay: string;
  policyAction: DaoPolicyActionId;
  submitAttempted: boolean;
  editableRoleOptionsLength: number;
  permissionsRole: GovernanceDaoRole | null | undefined;
  selectedPermissionsCount: number;
  permissionsUpdateChanged: boolean;
  memberThresholdChanged: boolean;
  permissionsMemberThresholdInput: string;
  permissionsMemberThresholdSmallest: string | null | undefined;
  bondChanged: boolean;
  nextBondYocto: string | null | undefined;
  periodChanged: boolean;
  periodDaysInput: string;
  parametersChanged: boolean;
  newRoleName: string;
  normalizedNewRoleName: string | null;
  roleExists: boolean;
  daoPolicy: GovernanceDaoPolicy | null;
  addRoleAccessMode: DaoAddRoleAccessMode;
  addRoleUsesCustomPermissions: boolean;
  addRolePermissionsCount: number;
  removableRoleOptionsLength: number;
  targetRoleId: string;
  nextVoteThreshold: [number, number] | null | undefined;
  votePolicyChanged: boolean;
  configNameInput: string;
  configPurposeInput: string;
  normalizedConfigName: string | null;
  normalizedConfigPurpose: string | null;
  configChanged: boolean;
}): { blockedReason: string; fieldHints: PolicyFieldHints } {
  const fieldHints: PolicyFieldHints = {};

  if (!input.isConnected) {
    return {
      blockedReason: portalConnectMessage('governance.policy'),
      fieldHints,
    };
  }

  if (!input.canEditPolicy) {
    return {
      blockedReason: 'Your wallet cannot propose policy changes on this DAO.',
      fieldHints,
    };
  }

  if (!input.canProposeSelectedPolicyAction) {
    return {
      blockedReason:
        'Your wallet cannot propose this policy change on the DAO.',
      fieldHints,
    };
  }

  if (!input.canCoverBond) {
    return {
      blockedReason: `Add ${input.bondDisplay} NEAR to your wallet for the proposal bond.`,
      fieldHints,
    };
  }

  if (input.policyAction === 'update_permissions') {
    if (input.editableRoleOptionsLength === 0) {
      return {
        blockedReason: 'No editable roles in DAO policy.',
        fieldHints,
      };
    }

    if (!input.permissionsRole) {
      const message = 'Choose a role to update.';
      if (input.submitAttempted) {
        fieldHints.permissions = message;
      }
      return { blockedReason: message, fieldHints };
    }

    if (input.selectedPermissionsCount === 0) {
      const message = 'Select at least one permission.';
      if (input.submitAttempted) {
        fieldHints.permissions = message;
      }
      return { blockedReason: message, fieldHints };
    }

    if (!input.permissionsUpdateChanged) {
      return { blockedReason: 'No changes yet.', fieldHints };
    }

    if (
      input.memberThresholdChanged &&
      input.permissionsMemberThresholdInput.trim() &&
      !input.permissionsMemberThresholdSmallest
    ) {
      const message = `Proposer threshold must be between ${MIN_PROPOSER_THRESHOLD_SOCIAL.toLocaleString('en-US')} and ${MAX_PROPOSER_THRESHOLD_SOCIAL.toLocaleString('en-US')} SOCIAL.`;
      fieldHints.memberThreshold = message;
      return { blockedReason: message, fieldHints };
    }
  }

  if (input.policyAction === 'update_parameters') {
    if (
      input.bondChanged &&
      input.nextBondYocto &&
      !isProposalBondWithinMax(input.nextBondYocto)
    ) {
      const message = `Proposal bond cannot exceed ${MAX_PROPOSAL_BOND_NEAR} NEAR.`;
      if (input.submitAttempted || input.nextBondYocto) {
        fieldHints.bond = message;
      }
      return { blockedReason: message, fieldHints };
    }

    if (
      input.periodChanged &&
      input.periodDaysInput &&
      !isProposalPeriodDaysWithinMax(input.periodDaysInput)
    ) {
      const message = `Voting period cannot exceed ${MAX_PROPOSAL_PERIOD_DAYS} days.`;
      if (input.submitAttempted || input.periodDaysInput.trim()) {
        fieldHints.period = message;
      }
      return { blockedReason: message, fieldHints };
    }

    if (!input.parametersChanged) {
      return { blockedReason: 'No changes yet.', fieldHints };
    }
  }

  if (input.policyAction === 'update_config') {
    if (!input.normalizedConfigName) {
      const message = input.configNameInput.trim()
        ? 'DAO name is too long.'
        : 'DAO name required.';
      if (input.submitAttempted || input.configNameInput.trim()) {
        fieldHints.configName = message;
      }
      return {
        blockedReason: input.configNameInput.trim()
          ? message
          : 'Enter a valid DAO name.',
        fieldHints,
      };
    }

    if (!input.normalizedConfigPurpose) {
      const message = input.configPurposeInput.trim()
        ? 'Purpose is too long.'
        : 'Purpose required.';
      if (input.submitAttempted || input.configPurposeInput.trim()) {
        fieldHints.configPurpose = message;
      }
      return {
        blockedReason: input.configPurposeInput.trim()
          ? message
          : 'Enter a valid DAO purpose.',
        fieldHints,
      };
    }

    if (!input.configChanged) {
      return { blockedReason: 'No changes yet.', fieldHints };
    }
  }

  if (input.policyAction === 'add_role') {
    const newRoleNameHint = resolveNewRoleNameFieldHint({
      newRoleName: input.newRoleName,
      normalizedNewRoleName: input.normalizedNewRoleName,
      roleExists: input.roleExists,
      submitAttempted: input.submitAttempted,
    });

    if (newRoleNameHint) {
      fieldHints.newRoleName = newRoleNameHint;
      return {
        blockedReason:
          newRoleNameHint === 'Role name required.'
            ? 'Enter a valid new role name.'
            : newRoleNameHint,
        fieldHints,
      };
    }

    const accessBlockReason = getAddRoleAccessBlockReason(
      input.daoPolicy,
      input.addRoleAccessMode
    );
    if (accessBlockReason) {
      if (input.submitAttempted) {
        fieldHints.addRoleAccess = accessBlockReason;
      }
      return { blockedReason: accessBlockReason, fieldHints };
    }

    if (
      input.addRoleUsesCustomPermissions &&
      input.addRolePermissionsCount === 0
    ) {
      const message = 'Select at least one permission.';
      if (input.submitAttempted) {
        fieldHints.addRolePermissions = message;
      }
      return { blockedReason: message, fieldHints };
    }
  }

  if (input.policyAction === 'remove_role') {
    if (input.removableRoleOptionsLength === 0) {
      return {
        blockedReason:
          'No removable roles. Add another full-access council role before removing guardians.',
        fieldHints,
      };
    }

    const removeBlockReason = getRemoveDaoPolicyRoleBlockReason(
      input.daoPolicy,
      input.targetRoleId
    );
    if (removeBlockReason) {
      if (input.submitAttempted || input.targetRoleId.trim()) {
        fieldHints.removeRole = removeBlockReason;
      }
      return { blockedReason: removeBlockReason, fieldHints };
    }
  }

  if (input.policyAction === 'update_vote_policy') {
    if (!input.nextVoteThreshold) {
      const message = 'Choose an approval threshold.';
      if (input.submitAttempted) {
        fieldHints.voteThreshold = message;
      }
      return { blockedReason: message, fieldHints };
    }

    if (!input.votePolicyChanged) {
      return { blockedReason: 'No changes yet.', fieldHints };
    }
  }

  return { blockedReason: '', fieldHints };
}

export function resolvePolicySubmitFeedback(input: {
  error: string;
  blockedReason: string;
  fieldHints: PolicyFieldHints;
  submitAttempted: boolean;
}): string | null {
  if (input.error.trim()) {
    return input.error;
  }

  if (!input.submitAttempted || !input.blockedReason) {
    return null;
  }

  const activeFieldHints = Object.values(input.fieldHints).filter(Boolean);
  if (activeFieldHints.includes(input.blockedReason)) {
    return null;
  }

  if (
    input.blockedReason === 'Enter a valid new role name.' &&
    input.fieldHints.newRoleName
  ) {
    return null;
  }

  return input.blockedReason;
}
