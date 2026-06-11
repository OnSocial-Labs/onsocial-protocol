import {
  getDaoProposalKindName,
  normalizeDaoProposalKind,
} from '@/features/governance/governance-proposal-kind';
import {
  DAO_SIGNAL_PROPOSAL_LABEL,
  formatDaoRoleDisplayName,
} from '@/features/governance/governance-proposal-builders';
import { yoctoToNear, yoctoToSocial, TOKEN_CONTRACT } from '@/lib/near-rpc';

export type ProposalTargetKind = 'role' | 'community' | 'contract' | 'amount';

export const PROPOSAL_TARGET_KIND_LABELS: Record<ProposalTargetKind, string> = {
  role: 'Role',
  community: 'Community',
  contract: 'Contract',
  amount: 'Amount',
};

/** Eyebrow above the right column on proposal cards (Role, Amount, etc.). */
export function resolveProposalTargetEyebrowLabel(
  targetKind: ProposalTargetKind | null
): string | null {
  if (!targetKind) {
    return null;
  }

  return PROPOSAL_TARGET_KIND_LABELS[targetKind];
}

function proposalTarget(
  targetKind: ProposalTargetKind | null,
  targetValue: string | null | undefined,
  targetAccountId?: string | null
): {
  targetKind: ProposalTargetKind | null;
  targetValue: string | null;
  targetAccountId: string | null;
} {
  const trimmed = targetValue?.trim() || null;
  const accountId = targetAccountId?.trim() || null;
  return {
    targetKind: targetKind && trimmed ? targetKind : null,
    targetValue: trimmed,
    targetAccountId: targetKind === 'contract' && accountId ? accountId : null,
  };
}

function getTransferShape(kindPayload: unknown): {
  receiverId: string | null;
  amount: string | null;
  tokenId: string | null;
} {
  return {
    receiverId: readStringField(kindPayload, 'receiver_id'),
    amount: readStringField(kindPayload, 'amount'),
    tokenId: readStringField(kindPayload, 'token_id'),
  };
}

function parseFundSeasonPoolTransferMsg(msg: string | null): {
  seasonId: string | null;
  action: string | null;
} {
  if (!msg?.trim()) {
    return { seasonId: null, action: null };
  }

  try {
    const parsed = JSON.parse(msg) as Record<string, unknown>;
    const action =
      typeof parsed.action === 'string' && parsed.action.trim()
        ? parsed.action.trim()
        : null;
    const seasonId =
      typeof parsed.season_id === 'string' && parsed.season_id.trim()
        ? parsed.season_id.trim()
        : null;
    return { seasonId, action };
  } catch {
    return { seasonId: null, action: null };
  }
}

function isSocialTokenContract(accountId: string | null): boolean {
  if (!accountId) {
    return false;
  }

  return accountId.trim().toLowerCase() === TOKEN_CONTRACT.toLowerCase();
}

function formatSocialAmountLabel(amount: string): string {
  return `${yoctoToSocial(amount)} SOCIAL`;
}

function formatTransferAmountLabel(
  amount: string,
  tokenId: string | null
): string {
  const normalizedToken = tokenId?.trim().toLowerCase() ?? '';
  if (!normalizedToken) {
    return `${yoctoToNear(amount)} NEAR`;
  }

  if (normalizedToken.includes('social')) {
    return formatSocialAmountLabel(amount);
  }

  const shortToken = shortContractName(tokenId) ?? 'tokens';
  return `${yoctoToSocial(amount)} ${shortToken}`;
}

function shouldShowProposerSeparately(
  proposer: string | null,
  subjectAccount: string | null
): boolean {
  return (
    !!proposer &&
    !!subjectAccount &&
    proposer.toLowerCase() !== subjectAccount.toLowerCase()
  );
}

function isSameNearAccount(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = left?.trim();
  const b = right?.trim();
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function resolveMembershipProposerDisplay(
  proposer: string | null,
  memberId: string | null
): Pick<ProposalPresentation, 'showProposerSeparately' | 'showProposerAsSelf'> {
  if (isSameNearAccount(proposer, memberId)) {
    return { showProposerSeparately: false, showProposerAsSelf: true };
  }

  return {
    showProposerSeparately: shouldShowProposerSeparately(proposer, memberId),
    showProposerAsSelf: false,
  };
}

/** Sputnik DAO policy permission keys — what the proposal actually proposes. */
const PROPOSAL_KIND_POLICY_LABEL: Record<string, string> = {
  ChangeConfig: 'config',
  ChangePolicy: 'policy',
  AddMemberToRole: 'add_member_to_role',
  RemoveMemberFromRole: 'remove_member_from_role',
  FunctionCall: 'call',
  UpgradeSelf: 'upgrade_self',
  UpgradeRemote: 'upgrade_remote',
  Transfer: 'transfer',
  SetStakingContract: 'set_vote_token',
  AddBounty: 'add_bounty',
  BountyDone: 'bounty_done',
  Vote: 'vote',
  FactoryInfoUpdate: 'factory_info_update',
  ChangePolicyAddOrUpdateRole: 'policy_add_or_update_role',
  ChangePolicyRemoveRole: 'policy_remove_role',
  ChangePolicyUpdateDefaultVotePolicy: 'policy_update_default_vote_policy',
  ChangePolicyUpdateParameters: 'policy_update_parameters',
};

const GENERIC_KIND_BADGES: Record<string, string> = {
  AddMemberToRole: 'Join',
  RemoveMemberFromRole: 'Leave',
  FunctionCall: 'Call',
  Transfer: 'Transfer',
  ChangeConfig: 'Config',
  ChangePolicy: 'Policy',
  UpgradeSelf: 'Upgrade',
  UpgradeRemote: 'Upgrade',
  SetStakingContract: 'Staking',
  AddBounty: 'Bounty',
  BountyDone: 'Bounty',
  Vote: DAO_SIGNAL_PROPOSAL_LABEL,
  FactoryInfoUpdate: 'Factory',
};

const CONTRACT_SHORT_NAMES: Record<string, string> = {
  'rewards.onsocial.testnet': 'Rewards',
  'rewards.onsocial.near': 'Rewards',
  'boost.onsocial.testnet': 'Boost',
  'boost.onsocial.near': 'Boost',
  'core.onsocial.testnet': 'Core',
  'core.onsocial.near': 'Core',
  'scarces.onsocial.testnet': 'Scarces',
  'scarces.onsocial.near': 'Scarces',
  'token.onsocial.testnet': 'Token',
  'token.onsocial.near': 'Token',
  'social-spend.onsocial.testnet': 'Social spend',
  'social-spend.onsocial.near': 'Social spend',
  'staking-governance.onsocial.testnet': 'Staking governance',
  'staking-governance.onsocial.near': 'Staking governance',
  'staking-treasury.onsocial.testnet': 'Staking treasury',
  'staking-treasury.onsocial.near': 'Staking treasury',
  'staking.onsocial.testnet': 'Staking',
  'staking.onsocial.near': 'Staking',
};

function getProposalKindKey(kind: unknown): string | null {
  return getDaoProposalKindName(normalizeDaoProposalKind(kind) ?? kind);
}

function readStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function decodeBase64Json(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(atob(value)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getFunctionCallShape(kind: Record<string, unknown> | undefined): {
  receiverId: string | null;
  methodName: string | null;
  config: Record<string, unknown> | null;
  ownershipTarget: string | null;
  amountYocto: string | null;
  seasonId: string | null;
  transferCallMsg: string | null;
} {
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return {
      receiverId: null,
      methodName: null,
      config: null,
      ownershipTarget: null,
      amountYocto: null,
      seasonId: null,
      transferCallMsg: null,
    };
  }

  const receiverId = readStringField(functionCall, 'receiver_id');
  const actions =
    'actions' in functionCall && Array.isArray(functionCall.actions)
      ? functionCall.actions
      : [];
  const firstAction = actions[0];
  const methodName =
    firstAction && typeof firstAction === 'object'
      ? readStringField(firstAction, 'method_name')
      : null;
  const args =
    firstAction &&
    typeof firstAction === 'object' &&
    'args' in firstAction &&
    typeof firstAction.args === 'string'
      ? decodeBase64Json(firstAction.args)
      : null;
  const config =
    args?.config &&
    typeof args.config === 'object' &&
    !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : null;
  const ownershipTarget =
    readStringField(args, 'new_owner') ?? readStringField(args, 'owner_id');
  const amountYocto = readStringField(args, 'amount');
  const seasonIdFromArgs = readStringField(args, 'season_id');
  const transferCallMsg = readStringField(args, 'msg');
  const fundSeasonPoolMsg =
    methodName === 'ft_transfer_call'
      ? parseFundSeasonPoolTransferMsg(transferCallMsg)
      : { seasonId: null, action: null };
  const seasonId =
    seasonIdFromArgs ??
    (fundSeasonPoolMsg.action === 'fund_season_pool'
      ? fundSeasonPoolMsg.seasonId
      : null);

  return {
    receiverId,
    methodName,
    config,
    ownershipTarget,
    amountYocto,
    seasonId,
    transferCallMsg,
  };
}

function shortContractName(accountId: string | null): string | null {
  if (!accountId) {
    return null;
  }

  const normalized = accountId.toLowerCase();
  if (CONTRACT_SHORT_NAMES[normalized]) {
    return CONTRACT_SHORT_NAMES[normalized];
  }

  const local = normalized.split('.')[0];
  if (!local) {
    return accountId;
  }

  return local.charAt(0).toUpperCase() + local.slice(1);
}

function formatMethodLabel(methodName: string | null): string | null {
  if (!methodName) {
    return null;
  }

  const words = methodName.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function firstDescriptionLine(
  description: string | null | undefined
): string | null {
  const trimmed = description?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split('\n')[0]?.trim() || null;
}

function readPolicyRolePayload(kindPayload: unknown): {
  name: string | null;
  permissions: string[];
  hasWildcard: boolean;
} | null {
  if (
    !kindPayload ||
    typeof kindPayload !== 'object' ||
    Array.isArray(kindPayload)
  ) {
    return null;
  }

  const role =
    'role' in kindPayload &&
    kindPayload.role &&
    typeof kindPayload.role === 'object' &&
    !Array.isArray(kindPayload.role)
      ? kindPayload.role
      : null;

  if (!role) {
    return null;
  }

  const name = readStringField(role, 'name');
  const permissions = Array.isArray(
    (role as Record<string, unknown>).permissions
  )
    ? ((role as Record<string, unknown>).permissions as unknown[]).filter(
        (permission): permission is string => typeof permission === 'string'
      )
    : [];

  return {
    name,
    permissions,
    hasWildcard: permissions.includes('*:*'),
  };
}

function classifyPolicyRoleUpdate({
  roleLabel,
  roleName,
  hasWildcard,
  description,
}: {
  roleLabel: string | null;
  roleName: string | null;
  hasWildcard: boolean;
  description: string | null;
}): { actionBadge: string; headline: string } {
  const normalizedDescription = description?.trim().toLowerCase() ?? '';
  const targetLabel = roleLabel ?? roleName ?? 'DAO role';

  if (
    normalizedDescription.includes('permission') ||
    normalizedDescription.includes('permissions')
  ) {
    return {
      actionBadge: 'Permissions',
      headline: `Update ${targetLabel} permissions`,
    };
  }

  if (
    normalizedDescription.startsWith('add ') &&
    normalizedDescription.includes(' role')
  ) {
    return {
      actionBadge: 'Add role',
      headline: roleLabel ? `Add ${roleLabel} role` : 'Add DAO role',
    };
  }

  if (hasWildcard) {
    return {
      actionBadge: 'Add role',
      headline: roleLabel ? `Add ${roleLabel} role` : 'Add council role',
    };
  }

  return {
    actionBadge: 'Update role',
    headline: roleLabel ? `Update ${roleLabel}` : 'Update DAO role',
  };
}

function withProposerSubject(
  presentation: Omit<
    PresentationCore,
    | 'subjectAccount'
    | 'showProposerSeparately'
    | 'subjectEyebrow'
    | 'showProposerAsSelf'
  >,
  proposer: string | null
): PresentationCore {
  return {
    ...presentation,
    subjectAccount: proposer,
    subjectEyebrow: proposer ? 'Proposer' : null,
    showProposerSeparately: false,
    showProposerAsSelf: false,
  };
}

/** Contract calls: proposer on the left, contract short name + action on the right. */
function withContractCallSubject({
  headline,
  actionBadge,
  contractLabel,
  receiverId,
  normalizedProposer,
  onChainDescription,
}: {
  headline: string;
  actionBadge: string;
  contractLabel: string | null;
  receiverId: string | null;
  normalizedProposer: string | null;
  onChainDescription: string | null;
}): PresentationCore {
  const proposerDiffersFromReceiver =
    !!normalizedProposer &&
    !!receiverId &&
    normalizedProposer.toLowerCase() !== receiverId.toLowerCase();
  const proposerIsSubject =
    !!normalizedProposer &&
    !!receiverId &&
    normalizedProposer.toLowerCase() === receiverId.toLowerCase();

  return {
    headline,
    actionBadge,
    ...proposalTarget('contract', contractLabel ?? receiverId, receiverId),
    subjectAccount: proposerDiffersFromReceiver
      ? normalizedProposer
      : receiverId,
    subjectEyebrow:
      proposerDiffersFromReceiver || proposerIsSubject ? 'Proposer' : null,
    onChainDescription,
    proposer: normalizedProposer,
    showProposerSeparately: false,
    showProposerAsSelf: false,
  };
}

export type ProposalPresentation = {
  headline: string;
  actionBadge: string | null;
  targetKind: ProposalTargetKind | null;
  targetValue: string | null;
  /** Full NEAR account id when targetKind is contract (e.g. rewards.onsocial.testnet). */
  targetAccountId: string | null;
  subjectAccount: string | null;
  /** Eyebrow above the subject column (e.g. To, From, Member, Season). */
  subjectEyebrow: string | null;
  /** Plain-text subject when the target is not a NEAR account (e.g. season id). */
  subjectText: string | null;
  onChainDescription: string | null;
  proposer: string | null;
  showProposerSeparately: boolean;
  /** Self-nomination: show Proposer eyebrow with "Self" instead of repeating the member chip. */
  showProposerAsSelf: boolean;
  /** Policy permission key (e.g. add_member_to_role) or contract method_name. */
  onChainAction: string | null;
  onChainActionKind: 'policy' | 'method' | null;
};

type PresentationCore = Omit<
  ProposalPresentation,
  | 'onChainAction'
  | 'onChainActionKind'
  | 'subjectEyebrow'
  | 'subjectText'
  | 'showProposerAsSelf'
> &
  Partial<
    Pick<
      ProposalPresentation,
      'subjectEyebrow' | 'subjectText' | 'showProposerAsSelf'
    >
  >;

function resolveOnChainActionFields(
  kind: Record<string, unknown> | null | undefined,
  kindKey: string | null
): Pick<ProposalPresentation, 'onChainAction' | 'onChainActionKind'> {
  if (!kindKey) {
    return { onChainAction: null, onChainActionKind: null };
  }

  if (kindKey === 'FunctionCall') {
    const methodName = getFunctionCallShape(kind ?? undefined).methodName;
    return {
      onChainAction: methodName,
      onChainActionKind: methodName ? 'method' : null,
    };
  }

  const policyLabel = PROPOSAL_KIND_POLICY_LABEL[kindKey];
  return {
    onChainAction: policyLabel ?? null,
    onChainActionKind: policyLabel ? 'policy' : null,
  };
}

export function deriveProposalPresentation({
  kind,
  description,
  proposer,
  fallbackHeadline,
}: {
  kind: Record<string, unknown> | string | null | undefined;
  description: string | null | undefined;
  proposer: string | null | undefined;
  fallbackHeadline?: string | null;
}): ProposalPresentation {
  const onChainDescription = description?.trim() || null;
  const normalizedProposer = proposer?.trim() || null;
  const normalizedKind = normalizeDaoProposalKind(kind);
  const kindKey = getProposalKindKey(kind);
  const actionBadge = kindKey ? (GENERIC_KIND_BADGES[kindKey] ?? null) : null;
  const onChainFields = resolveOnChainActionFields(normalizedKind, kindKey);
  const finish = (presentation: PresentationCore): ProposalPresentation => ({
    ...presentation,
    subjectEyebrow: presentation.subjectEyebrow ?? null,
    subjectText: presentation.subjectText ?? null,
    showProposerAsSelf: presentation.showProposerAsSelf ?? false,
    ...onChainFields,
  });

  if (!kindKey || !normalizedKind) {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        'Governance proposal',
      actionBadge,
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      onChainDescription,
      proposer: normalizedProposer,
      showProposerSeparately: false,
    });
  }

  const kindPayload = normalizedKind[kindKey];

  if (kindKey === 'AddMemberToRole' || kindKey === 'RemoveMemberFromRole') {
    const memberId = readStringField(kindPayload, 'member_id');
    const roleId = readStringField(kindPayload, 'role');
    const roleName = roleId ? formatDaoRoleDisplayName(roleId) : null;
    const verb = kindKey === 'AddMemberToRole' ? 'Add to' : 'Remove from';
    const headline = roleName
      ? `${verb} ${roleName}`
      : memberId
        ? `${verb} ${memberId}`
        : (firstDescriptionLine(onChainDescription) ?? 'Membership proposal');

    return finish({
      headline,
      actionBadge,
      ...proposalTarget('role', roleName),
      subjectAccount: memberId,
      subjectEyebrow: memberId ? 'Member' : null,
      onChainDescription,
      proposer: normalizedProposer,
      ...resolveMembershipProposerDisplay(normalizedProposer, memberId),
    });
  }

  if (kindKey === 'FunctionCall') {
    const {
      receiverId,
      methodName,
      config,
      ownershipTarget,
      amountYocto,
      seasonId,
      transferCallMsg,
    } = getFunctionCallShape(normalizedKind ?? undefined);
    const contractLabel = shortContractName(receiverId);
    const methodLabel = formatMethodLabel(methodName);
    const appLabel =
      config && typeof config.label === 'string' ? config.label.trim() : null;
    const appId =
      config && typeof config.app_id === 'string' ? config.app_id.trim() : null;

    let headline = firstDescriptionLine(onChainDescription) ?? 'Function call';
    let subjectAccount = receiverId;

    if (methodName === 'register_app' && (appLabel || appId)) {
      headline = appLabel ?? appId ?? headline;
      subjectAccount = appId;
      const proposerMatchesSubject =
        !!normalizedProposer &&
        !!subjectAccount &&
        normalizedProposer.toLowerCase() === subjectAccount.toLowerCase();
      return finish({
        headline,
        actionBadge: 'Partner',
        ...proposalTarget('community', appLabel ?? appId),
        subjectAccount,
        subjectEyebrow: proposerMatchesSubject ? 'Proposer' : null,
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately:
          !!normalizedProposer && !!subjectAccount && !proposerMatchesSubject,
      });
    }

    if (methodName === 'set_owner' || methodName === 'transfer_ownership') {
      headline =
        contractLabel && ownershipTarget
          ? `Transfer ${contractLabel} ownership to ${ownershipTarget}`
          : contractLabel
            ? `Transfer ${contractLabel} ownership`
            : 'Transfer contract ownership';
      return finish({
        headline,
        actionBadge: 'Ownership',
        ...proposalTarget('contract', contractLabel, receiverId),
        subjectAccount: ownershipTarget ?? receiverId,
        subjectEyebrow: ownershipTarget ? 'To' : null,
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately: shouldShowProposerSeparately(
          normalizedProposer,
          ownershipTarget
        ),
      });
    }

    if (methodName === 'withdraw_treasury' && receiverId) {
      const amountLabel = amountYocto
        ? formatSocialAmountLabel(amountYocto)
        : null;
      headline = amountLabel
        ? `Sweep ${amountLabel} from social spend`
        : contractLabel
          ? `Sweep ${contractLabel} treasury fees`
          : 'Sweep social-spend treasury fees';
      return finish({
        headline,
        actionBadge: 'Treasury',
        ...proposalTarget('amount', amountLabel),
        subjectAccount: receiverId,
        subjectEyebrow: 'From',
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately: shouldShowProposerSeparately(
          normalizedProposer,
          receiverId
        ),
      });
    }

    if (methodName === 'fund_season_pool_from_treasury' && receiverId) {
      const amountLabel = amountYocto
        ? formatSocialAmountLabel(amountYocto)
        : null;
      headline =
        seasonId && amountLabel
          ? `Fund ${seasonId} with ${amountLabel}`
          : seasonId
            ? `Fund ${seasonId} rally pool`
            : contractLabel
              ? `Fund rally pool via ${contractLabel}`
              : 'Fund rally pool from treasury';
      return finish({
        headline,
        actionBadge: 'Treasury',
        ...proposalTarget('amount', amountLabel),
        subjectText: seasonId,
        subjectEyebrow: seasonId ? 'Season' : null,
        subjectAccount: null,
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately: !!normalizedProposer,
      });
    }

    if (
      methodName === 'ft_transfer_call' &&
      isSocialTokenContract(receiverId) &&
      seasonId &&
      parseFundSeasonPoolTransferMsg(transferCallMsg).action ===
        'fund_season_pool'
    ) {
      const amountLabel = amountYocto
        ? formatSocialAmountLabel(amountYocto)
        : null;
      headline =
        amountLabel && seasonId
          ? `Fund ${seasonId} with ${amountLabel}`
          : `Fund ${seasonId} rally pool`;
      return finish({
        headline,
        actionBadge: 'Treasury',
        ...proposalTarget('amount', amountLabel),
        subjectText: seasonId,
        subjectEyebrow: 'Season',
        subjectAccount: null,
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately: !!normalizedProposer,
      });
    }

    if (
      methodName === 'update_contract' ||
      methodName === 'update_contract_from_hash'
    ) {
      headline = contractLabel
        ? `Upgrade ${contractLabel}`
        : 'Upgrade contract';
      return finish(
        withContractCallSubject({
          headline,
          actionBadge: 'Upgrade',
          contractLabel,
          receiverId,
          normalizedProposer,
          onChainDescription,
        })
      );
    }

    if (methodLabel && contractLabel) {
      headline = `${methodLabel} on ${contractLabel}`;
    } else if (methodLabel) {
      headline = methodLabel;
    }

    return finish(
      withContractCallSubject({
        headline,
        actionBadge: actionBadge ?? 'Call',
        contractLabel,
        receiverId: subjectAccount,
        normalizedProposer,
        onChainDescription,
      })
    );
  }

  if (kindKey === 'Transfer') {
    const { receiverId, amount, tokenId } = getTransferShape(kindPayload);
    const amountLabel = amount
      ? formatTransferAmountLabel(amount, tokenId)
      : null;
    const headline =
      amountLabel && receiverId
        ? `Send ${amountLabel} to ${receiverId}`
        : receiverId
          ? `Treasury transfer to ${receiverId}`
          : 'Treasury transfer';
    const transferDescription =
      onChainDescription ??
      (amountLabel && receiverId
        ? `Send ${amountLabel} from the DAO treasury to ${receiverId}.`
        : null);

    return finish({
      headline,
      actionBadge: actionBadge ?? 'Transfer',
      ...proposalTarget('amount', amountLabel),
      subjectAccount: receiverId ?? normalizedProposer,
      subjectEyebrow: receiverId ? 'To' : null,
      onChainDescription: transferDescription,
      proposer: normalizedProposer,
      showProposerSeparately: shouldShowProposerSeparately(
        normalizedProposer,
        receiverId
      ),
    });
  }

  if (kindKey === 'SetStakingContract') {
    const stakingId = readStringField(kindPayload, 'staking_id');
    const contractLabel = shortContractName(stakingId);
    const headline =
      firstDescriptionLine(onChainDescription) ??
      (contractLabel
        ? `Set ${contractLabel} for voting`
        : stakingId
          ? `Set ${stakingId} for voting`
          : 'Set staking contract');

    return finish(
      withProposerSubject(
        {
          headline,
          actionBadge: actionBadge ?? 'Staking',
          ...proposalTarget('contract', contractLabel ?? stakingId, stakingId),
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'ChangePolicyAddOrUpdateRole') {
    const rolePayload = readPolicyRolePayload(kindPayload);
    const roleName = rolePayload?.name ?? null;
    const roleLabel = roleName ? formatDaoRoleDisplayName(roleName) : null;
    const classified = classifyPolicyRoleUpdate({
      roleLabel,
      roleName,
      hasWildcard: rolePayload?.hasWildcard ?? false,
      description: onChainDescription,
    });

    return finish(
      withProposerSubject(
        {
          headline: classified.headline,
          actionBadge: classified.actionBadge,
          ...proposalTarget('role', roleLabel),
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'ChangePolicyRemoveRole') {
    const roleId = readStringField(kindPayload, 'role');
    const roleName = roleId ? formatDaoRoleDisplayName(roleId) : null;
    const headline = roleName ? `Remove ${roleName}` : 'Remove DAO role';

    return finish(
      withProposerSubject(
        {
          headline,
          actionBadge: 'Remove role',
          ...proposalTarget('role', roleName),
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'ChangePolicyUpdateParameters') {
    return finish(
      withProposerSubject(
        {
          headline:
            firstDescriptionLine(onChainDescription) ?? 'Update DAO parameters',
          actionBadge: 'Parameters',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'ChangePolicyUpdateDefaultVotePolicy') {
    return finish(
      withProposerSubject(
        {
          headline:
            firstDescriptionLine(onChainDescription) ?? 'Update vote policy',
          actionBadge: 'Vote policy',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'ChangePolicy' || kindKey === 'ChangeConfig') {
    return finish(
      withProposerSubject(
        {
          headline:
            firstDescriptionLine(onChainDescription) ??
            (kindKey === 'ChangeConfig'
              ? 'Update config'
              : 'DAO policy change'),
          actionBadge: actionBadge ?? 'Policy',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  if (kindKey === 'Vote') {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        'Signal proposal',
      actionBadge: DAO_SIGNAL_PROPOSAL_LABEL,
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: 'Proposer',
      onChainDescription,
      proposer: normalizedProposer,
      showProposerSeparately: false,
      showProposerAsSelf: false,
    });
  }

  if (kindKey === 'UpgradeSelf' || kindKey === 'UpgradeRemote') {
    return finish(
      withProposerSubject(
        {
          headline: 'Upgrade contract',
          actionBadge: actionBadge ?? 'Upgrade',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          onChainDescription,
          proposer: normalizedProposer,
        },
        normalizedProposer
      )
    );
  }

  const genericHeadline =
    firstDescriptionLine(onChainDescription) ??
    fallbackHeadline?.trim() ??
    'Governance proposal';

  return finish({
    headline: genericHeadline,
    actionBadge,
    targetKind: null,
    targetValue: null,
    targetAccountId: null,
    subjectAccount: normalizedProposer,
    subjectEyebrow: normalizedProposer ? 'Proposer' : null,
    onChainDescription,
    proposer: normalizedProposer,
    showProposerSeparately: false,
    showProposerAsSelf: false,
  });
}

function isPartnerRegistrationBlob(text: string): boolean {
  return (
    text.includes('Register community app') &&
    text.includes('Reward per action:')
  );
}

export function derivePartnerCardDescription({
  appDescription,
  onChainDescription,
}: {
  appDescription?: string | null;
  onChainDescription?: string | null;
}): string | null {
  const appText = appDescription?.trim();
  if (appText && !isPartnerRegistrationBlob(appText)) {
    return appText;
  }

  const onChainText = onChainDescription?.trim();
  if (onChainText) {
    const descriptionField = onChainText.match(
      /Description:\s*(.+?)(?:\s+Reward per action:|\s+Daily cap:|\s+Total budget:|$)/i
    );
    if (descriptionField?.[1]?.trim()) {
      return descriptionField[1].trim().replace(/\.\s*$/, '');
    }
  }

  return appText || onChainText || null;
}

function resolveFeedProposalKind(
  feedProposal: {
    kind?: Record<string, unknown> | string | null;
    payload?: unknown;
  } | null
): Record<string, unknown> | null {
  if (feedProposal?.kind != null) {
    return normalizeDaoProposalKind(feedProposal.kind);
  }

  const payload = feedProposal?.payload;
  if (!payload || typeof payload !== 'object' || !('proposal' in payload)) {
    return null;
  }

  const proposal = payload.proposal;
  if (!proposal || typeof proposal !== 'object' || !('kind' in proposal)) {
    return null;
  }

  return normalizeDaoProposalKind(proposal.kind);
}

export function resolveBootstrapDaoProposal(
  feedProposal: {
    description?: string | null;
    proposer?: string | null;
    kind?: Record<string, unknown> | null;
    payload?: unknown;
    snapshot?: {
      kind: Record<string, unknown>;
      description: string;
      proposer: string;
    } | null;
  } | null
): {
  kind: Record<string, unknown>;
  description: string;
  proposer: string;
} | null {
  if (feedProposal?.snapshot) {
    const kind =
      normalizeDaoProposalKind(feedProposal.snapshot.kind) ??
      feedProposal.snapshot.kind;
    return {
      kind,
      description: feedProposal.snapshot.description,
      proposer: feedProposal.snapshot.proposer,
    };
  }

  const kind = resolveFeedProposalKind(feedProposal);
  if (!kind) {
    return null;
  }

  return {
    kind,
    description: feedProposal?.description?.trim() ?? '',
    proposer: feedProposal?.proposer?.trim() ?? '',
  };
}

export function deriveProposalPresentationFromDaoProposal(
  proposal: {
    kind: Record<string, unknown>;
    description: string;
    proposer: string;
  } | null,
  fallback?: { label?: string | null; description?: string | null },
  options?: { protocolKind?: string | null }
): ProposalPresentation {
  const presentation = !proposal
    ? deriveProposalPresentation({
        kind: null,
        description: fallback?.description,
        proposer: null,
        fallbackHeadline: fallback?.label,
      })
    : deriveProposalPresentation({
        kind: proposal.kind,
        description: proposal.description,
        proposer: proposal.proposer,
        fallbackHeadline: fallback?.label,
      });

  if (presentation.actionBadge || options?.protocolKind !== 'signaling') {
    return presentation;
  }

  return {
    ...presentation,
    actionBadge: DAO_SIGNAL_PROPOSAL_LABEL,
  };
}
