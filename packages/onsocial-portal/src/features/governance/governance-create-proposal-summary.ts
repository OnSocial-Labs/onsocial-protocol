import type { CreatableDaoProposalAction } from '@/features/governance/governance-proposal-builders';
import {
  formatSeasonConfigSummary,
  formatSocialSpendActionConfigCardSummary,
  isSocialSpendRoutingMinEditableOperationId,
  isSupportSpendRoutingOperationId,
  seasonConfigDraftChanged,
  socialSpendActionDraftChanged,
  SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_SOCIAL_LABEL,
  SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_SOCIAL_LABEL,
  SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_SOCIAL_LABEL,
  SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_SOCIAL_LABEL,
  validateSeasonConfigDraft,
  validateSocialSpendActionRoutingBps,
  validateSocialSpendRoutingMinAmountYocto,
  type DaoContractConfigOperationId,
  type SocialSpendActionRoutingDraft,
  type SocialSpendSeasonConfigDraft,
} from '@/lib/dao-contract-config-operations';

export type GovernanceCreateProposalSummary = {
  primary: string;
  secondary: string | null;
  secondaryWarning: boolean;
};

function resolveStandardProposalPrimary(input: {
  proposalAction: CreatableDaoProposalAction;
  transferAmountInput: string;
  transferAmountSmallest: string | null;
  transferTokenSymbol: string | null;
  transferReceiverId: string;
  socialSpendSeasonId: string;
  socialSpendAmountInput: string;
  boostInfraAmountInput: string;
  isWithdrawBoostInfraAction: boolean;
  isSetBoostInfraAuthorityAction: boolean;
  treasuryDaoAccountId: string;
  roleId: string;
  subjectAccountId: string;
  isAddMemberAction: boolean;
  isRemoveMemberAction: boolean;
  contractUpgradeContractLabel: string | null;
  contractUpgradeCodeHash: string | null;
  transferOwnershipContractLabel: string | null;
  transferOwnershipNewOwnerId: string;
  contractConfigOperationLabel: string | null;
  isContractConfigAction: boolean;
}): string | null {
  if (input.proposalAction === 'transfer') {
    const amount = input.transferAmountInput.trim();
    const receiver = input.transferReceiverId.trim();
    const symbol = input.transferTokenSymbol ?? 'token';
    if (!amount || !receiver) {
      return 'Send DAO funds to a recipient account.';
    }
    if (!input.transferAmountSmallest) {
      return null;
    }
    return `Send ${amount} ${symbol} → @${receiver}`;
  }

  if (input.proposalAction === 'fund_season_pool') {
    const season = input.socialSpendSeasonId.trim();
    const amount = input.socialSpendAmountInput.trim();
    if (!season && !amount) {
      return 'Fund a rally season pool from DAO SOCIAL.';
    }
    if (!season) {
      return `Fund rally pool with ${amount || '…'} SOCIAL.`;
    }
    if (!amount) {
      return `Fund @${season} season pool.`;
    }
    return `Fund @${season} with ${amount} SOCIAL`;
  }

  if (input.isWithdrawBoostInfraAction) {
    const amount = input.boostInfraAmountInput.trim();
    return amount
      ? `Withdraw ${amount} SOCIAL from boost infra pool`
      : 'Withdraw SOCIAL from boost infra pool';
  }

  if (input.isSetBoostInfraAuthorityAction) {
    const treasury = input.treasuryDaoAccountId.trim();
    return treasury
      ? `Authorize @${treasury} to withdraw boost infra funds`
      : 'Authorize treasury DAO to withdraw boost infra funds';
  }

  if (input.isAddMemberAction) {
    const member = input.subjectAccountId.trim();
    const role = input.roleId.trim() || 'role';
    return member ? `Add @${member} to ${role}` : `Add a member to ${role}`;
  }

  if (input.isRemoveMemberAction) {
    const member = input.subjectAccountId.trim();
    const role = input.roleId.trim() || 'role';
    return member
      ? `Remove @${member} from ${role}`
      : `Remove a member from ${role}`;
  }

  if (input.proposalAction === 'join_self') {
    const role = input.roleId.trim() || 'role';
    return `Join ${role} as @${input.subjectAccountId.trim() || '…'}`;
  }

  if (input.proposalAction === 'leave_self') {
    const role = input.roleId.trim() || 'role';
    return `Leave ${role}`;
  }

  if (input.proposalAction === 'contract_upgrade') {
    const contract = input.contractUpgradeContractLabel?.trim() || 'contract';
    const hash = input.contractUpgradeCodeHash?.trim();
    if (!hash) {
      return `Upgrade ${contract} to a published WASM hash.`;
    }
    const shortHash =
      hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
    return `Upgrade ${contract} → ${shortHash}`;
  }

  if (input.proposalAction === 'transfer_ownership') {
    const contract = input.transferOwnershipContractLabel?.trim() || 'contract';
    const owner = input.transferOwnershipNewOwnerId.trim();
    return owner
      ? `Transfer ${contract} ownership → @${owner}`
      : `Transfer ${contract} ownership to a new account.`;
  }

  if (input.isContractConfigAction && input.contractConfigOperationLabel) {
    return `Update ${input.contractConfigOperationLabel.toLowerCase()}.`;
  }

  if (input.proposalAction === 'idea') {
    return 'Signal a proposal to the DAO.';
  }

  return null;
}

function resolveRoutingConfigSummary(input: {
  operationId: DaoContractConfigOperationId;
  operationLabel: string;
  draft: SocialSpendActionRoutingDraft | null;
  baseline: SocialSpendActionRoutingDraft | null;
  loading: boolean;
  loadError: string | null;
}): GovernanceCreateProposalSummary {
  const label = input.operationLabel.trim() || 'routing';
  const placeholder = 'Configure routing shares below.';

  if (input.loading) {
    return {
      primary: `Loading ${label.toLowerCase()}…`,
      secondary: null,
      secondaryWarning: false,
    };
  }

  if (input.loadError) {
    return {
      primary: placeholder,
      secondary: input.loadError,
      secondaryWarning: true,
    };
  }

  if (!input.draft) {
    return {
      primary: placeholder,
      secondary: null,
      secondaryWarning: false,
    };
  }

  const editableMinAmount = isSocialSpendRoutingMinEditableOperationId(
    input.operationId
  );
  const editableActive = isSupportSpendRoutingOperationId(input.operationId);
  const minAmountPolicy = editableMinAmount ? input.operationId : null;
  const routingValid = validateSocialSpendActionRoutingBps(input.draft);
  const minAmountValid =
    !editableMinAmount ||
    (minAmountPolicy != null &&
      validateSocialSpendRoutingMinAmountYocto(
        input.draft.min_amount,
        minAmountPolicy
      ));
  const matchesBaseline =
    input.baseline &&
    !socialSpendActionDraftChanged(input.baseline, input.draft, {
      includeMinAmount: editableMinAmount,
      includeActive: editableActive,
    });

  const minAmountRangeLabel =
    input.operationId === 'social_spend_join_rally_routing'
      ? `${SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_SOCIAL_LABEL}–${SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_SOCIAL_LABEL}`
      : `${SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_SOCIAL_LABEL}–${SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_SOCIAL_LABEL}`;

  let secondary: string | null = null;
  let secondaryWarning = false;

  if (!routingValid) {
    secondary = 'Shares must total 100%.';
    secondaryWarning = true;
  } else if (editableMinAmount && !minAmountValid) {
    secondary = `Min ${minAmountRangeLabel} SOCIAL.`;
    secondaryWarning = true;
  } else if (!input.baseline) {
    secondary = 'New action';
  } else if (matchesBaseline) {
    secondary = 'Matches chain';
  }

  const primary = formatSocialSpendActionConfigCardSummary(input.draft, {
    protocolFeesRouteToBoost: true,
    includeMinAmount: editableMinAmount,
  });

  return {
    primary,
    secondary,
    secondaryWarning,
  };
}

function resolveSeasonConfigSummary(input: {
  draft: SocialSpendSeasonConfigDraft | null;
  baseline: SocialSpendSeasonConfigDraft | null;
  loading: boolean;
  loadError: string | null;
  newSeasonOnChain: boolean;
}): GovernanceCreateProposalSummary {
  const placeholder = 'Set rally season open time, duration, and pause state.';

  if (input.loading) {
    return {
      primary: 'Loading rally season window…',
      secondary: null,
      secondaryWarning: false,
    };
  }

  if (input.loadError) {
    return {
      primary: placeholder,
      secondary: input.loadError,
      secondaryWarning: true,
    };
  }

  if (!input.draft) {
    return {
      primary: placeholder,
      secondary: null,
      secondaryWarning: false,
    };
  }

  const scheduleError = validateSeasonConfigDraft(input.draft);
  const scheduleValid = !scheduleError;
  const matchesBaseline =
    input.baseline && !seasonConfigDraftChanged(input.baseline, input.draft);

  let secondary: string | null = null;
  let secondaryWarning = false;

  if (scheduleError) {
    secondary = scheduleError;
    secondaryWarning = true;
  } else if (matchesBaseline) {
    secondary = 'Matches chain';
  } else if (input.newSeasonOnChain) {
    secondary = 'New season — not on chain yet.';
  }

  const seasonId = input.draft.season_id.trim().toLowerCase();
  const primary = scheduleValid
    ? formatSeasonConfigSummary(input.draft)
    : seasonId
      ? `${seasonId} · set open time and duration`
      : placeholder;

  return {
    primary,
    secondary,
    secondaryWarning,
  };
}

export function resolveGovernanceCreateProposalSummary(input: {
  proposalAction: CreatableDaoProposalAction;
  transferAmountInput: string;
  transferAmountSmallest: string | null;
  transferTokenSymbol: string | null;
  transferReceiverId: string;
  socialSpendSeasonId: string;
  socialSpendAmountInput: string;
  boostInfraAmountInput: string;
  isWithdrawBoostInfraAction: boolean;
  isSetBoostInfraAuthorityAction: boolean;
  treasuryDaoAccountId: string;
  roleId: string;
  subjectAccountId: string;
  isAddMemberAction: boolean;
  isRemoveMemberAction: boolean;
  contractUpgradeContractLabel: string | null;
  contractUpgradeCodeHash: string | null;
  transferOwnershipContractLabel: string | null;
  transferOwnershipNewOwnerId: string;
  contractConfigOperationLabel: string | null;
  isContractConfigAction: boolean;
  isSocialSpendRoutingConfig: boolean;
  isSeasonConfigConfig: boolean;
  contractConfigOperationId: DaoContractConfigOperationId | '';
  actionRoutingDraft: SocialSpendActionRoutingDraft | null;
  actionRoutingBaseline: SocialSpendActionRoutingDraft | null;
  actionRoutingLoading: boolean;
  actionRoutingLoadError: string | null;
  seasonConfigDraft: SocialSpendSeasonConfigDraft | null;
  seasonConfigBaseline: SocialSpendSeasonConfigDraft | null;
  seasonConfigLoading: boolean;
  seasonConfigLoadError: string | null;
  seasonConfigNewSeasonOnChain: boolean;
}): GovernanceCreateProposalSummary | null {
  if (input.isSocialSpendRoutingConfig && input.contractConfigOperationId) {
    return resolveRoutingConfigSummary({
      operationId: input.contractConfigOperationId,
      operationLabel: input.contractConfigOperationLabel ?? 'Routing',
      draft: input.actionRoutingDraft,
      baseline: input.actionRoutingBaseline,
      loading: input.actionRoutingLoading,
      loadError: input.actionRoutingLoadError,
    });
  }

  if (input.isSeasonConfigConfig) {
    return resolveSeasonConfigSummary({
      draft: input.seasonConfigDraft,
      baseline: input.seasonConfigBaseline,
      loading: input.seasonConfigLoading,
      loadError: input.seasonConfigLoadError,
      newSeasonOnChain: input.seasonConfigNewSeasonOnChain,
    });
  }

  const primary = resolveStandardProposalPrimary(input);
  if (!primary) {
    return null;
  }

  return {
    primary,
    secondary: null,
    secondaryWarning: false,
  };
}

/** @deprecated Use resolveGovernanceCreateProposalSummary */
export function resolveGovernanceCreateOutcomeLine(input: {
  proposalAction: CreatableDaoProposalAction;
  transferAmountInput: string;
  transferAmountSmallest: string | null;
  transferTokenSymbol: string | null;
  transferReceiverId: string;
  socialSpendSeasonId: string;
  socialSpendAmountInput: string;
  boostInfraAmountInput: string;
  isWithdrawBoostInfraAction: boolean;
  isSetBoostInfraAuthorityAction: boolean;
  treasuryDaoAccountId: string;
  roleId: string;
  subjectAccountId: string;
  isAddMemberAction: boolean;
  isRemoveMemberAction: boolean;
  contractUpgradeContractLabel: string | null;
  contractUpgradeCodeHash: string | null;
  transferOwnershipContractLabel: string | null;
  transferOwnershipNewOwnerId: string;
  contractConfigOperationLabel: string | null;
  isContractConfigAction: boolean;
  isSocialSpendRoutingConfig: boolean;
  isSeasonConfigConfig: boolean;
}): string | null {
  if (input.isSocialSpendRoutingConfig || input.isSeasonConfigConfig) {
    return null;
  }

  return resolveStandardProposalPrimary(input);
}

import { isBoundedNoteCharacterError } from '@/lib/bounded-note-field';

export function resolveGovernanceCreateSubmitFeedback(input: {
  error: string;
  blockedReason: string;
  proposalSummary: GovernanceCreateProposalSummary | null;
  isContractConfigAction: boolean;
  isSocialSpendRoutingConfig: boolean;
  isSeasonConfigConfig: boolean;
}): string | null {
  if (input.error.trim()) {
    if (isBoundedNoteCharacterError(input.error)) {
      return null;
    }
    return input.error;
  }

  if (
    input.blockedReason &&
    input.proposalSummary?.secondaryWarning &&
    input.isContractConfigAction &&
    (input.isSocialSpendRoutingConfig || input.isSeasonConfigConfig)
  ) {
    return null;
  }

  if (input.blockedReason && isBoundedNoteCharacterError(input.blockedReason)) {
    return null;
  }

  return input.blockedReason || null;
}
