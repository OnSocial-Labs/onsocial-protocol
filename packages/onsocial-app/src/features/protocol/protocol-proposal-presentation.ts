import {
  BOOST_CONTRACT,
  SOCIAL_SPEND_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { yoctoToSocial } from '@/lib/format-social-balance';
import {
  protocolProposalFamilyFromBadge,
  type ProtocolProposalFamily,
} from '@/features/protocol/protocol-proposal-family';

export type ProtocolProposalTargetKind =
  | 'role'
  | 'community'
  | 'contract'
  | 'amount'
  | 'code_hash'
  | 'routing'
  | 'season'
  | null;

export interface ProtocolProposalPresentation {
  headline: string;
  actionBadge: string | null;
  /** Coarse feed family for optional kind chips. */
  family: ProtocolProposalFamily;
  targetKind: ProtocolProposalTargetKind;
  targetValue: string | null;
  targetAccountId: string | null;
  subjectAccount: string | null;
  subjectText: string | null;
  subjectEyebrow: string | null;
  showProposerSeparately: boolean;
  /** Membership self-propose — show "Self" instead of a second chip. */
  showProposerAsSelf: boolean;
  /** Policy permission key (e.g. add_member_to_role) or contract method_name. */
  onChainAction: string | null;
  onChainActionKind: 'policy' | 'method' | null;
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

function resolveOnChainActionFields(
  kind: Record<string, unknown> | null | undefined,
  kindKey: string | null
): Pick<ProtocolProposalPresentation, 'onChainAction' | 'onChainActionKind'> {
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

function readStringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstDescriptionLine(
  description: string | null | undefined
): string | null {
  if (!description?.trim()) return null;
  const line = description
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return null;
  return line.length > 96 ? `${line.slice(0, 93).trimEnd()}…` : line;
}

function formatRoleDisplayName(roleId: string): string {
  return roleId
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function shortContractName(
  accountId: string | null | undefined
): string | null {
  const value = accountId?.trim();
  if (!value) return null;
  const base = value.split('.')[0]?.trim();
  return base || value;
}

function formatMethodLabel(methodName: string | null): string | null {
  if (!methodName?.trim()) return null;
  return methodName.trim().replace(/_/g, ' ');
}

function isSocialTokenContract(accountId: string | null): boolean {
  if (!accountId) return false;
  return accountId.trim().toLowerCase() === SOCIAL_TOKEN_CONTRACT.toLowerCase();
}

function formatTransferAmountLabel(
  amount: string,
  tokenId: string | null
): string {
  const normalizedToken = tokenId?.trim().toLowerCase() ?? '';
  if (!normalizedToken) {
    return `${yoctoToNear(amount)} NEAR`;
  }
  if (normalizedToken.includes('social') || isSocialTokenContract(tokenId)) {
    return `${yoctoToSocial(amount)} SOCIAL`;
  }
  const shortToken = shortContractName(tokenId) ?? 'tokens';
  return `${yoctoToSocial(amount)} ${shortToken}`;
}

function decodeFunctionCallArgs(args: unknown): Record<string, unknown> | null {
  if (!args) return null;
  if (typeof args === 'object') return args as Record<string, unknown>;
  if (typeof args !== 'string' || !args.trim()) return null;
  try {
    const decoded =
      typeof atob === 'function'
        ? atob(args)
        : Buffer.from(args, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    try {
      const parsed = JSON.parse(args) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function parseFundSeasonPoolTransferMsg(msg: string | null): {
  seasonId: string | null;
  action: string | null;
} {
  if (!msg?.trim()) return { seasonId: null, action: null };
  try {
    const parsed = JSON.parse(msg) as Record<string, unknown>;
    return {
      action:
        typeof parsed.action === 'string' && parsed.action.trim()
          ? parsed.action.trim()
          : null,
      seasonId:
        typeof parsed.season_id === 'string' && parsed.season_id.trim()
          ? parsed.season_id.trim()
          : null,
    };
  } catch {
    return { seasonId: null, action: null };
  }
}

function parseBoostLockTransferMsg(msg: string | null): {
  action: string | null;
  months: number | null;
} {
  if (!msg?.trim()) return { action: null, months: null };
  try {
    const parsed = JSON.parse(msg) as Record<string, unknown>;
    const months =
      typeof parsed.months === 'number' && Number.isFinite(parsed.months)
        ? parsed.months
        : typeof parsed.months === 'string' && /^\d+$/.test(parsed.months.trim())
          ? Number(parsed.months.trim())
          : null;
    return {
      action:
        typeof parsed.action === 'string' && parsed.action.trim()
          ? parsed.action.trim()
          : null,
      months,
    };
  } catch {
    return { action: null, months: null };
  }
}

function isBoostContract(accountId: string | null): boolean {
  if (!accountId) return false;
  return accountId.trim().toLowerCase() === BOOST_CONTRACT.toLowerCase();
}

function isCoreContract(accountId: string | null): boolean {
  if (!accountId) return false;
  return accountId.trim().toLowerCase() === CORE_CONTRACT.toLowerCase();
}

function isSocialSpendContract(accountId: string | null): boolean {
  if (!accountId) return false;
  return (
    accountId.trim().toLowerCase() === SOCIAL_SPEND_CONTRACT.toLowerCase()
  );
}

/** Classify core `execute` set payloads written under the DAO account. */
export function classifyCoreExecuteSetKeys(
  keys: string[]
): 'mood' | 'post' | 'profile' | null {
  const normalized = keys.map((key) => key.trim().toLowerCase()).filter(Boolean);
  if (normalized.some((key) => key === 'page/main' || key.startsWith('page/'))) {
    return 'mood';
  }
  if (normalized.some((key) => key.startsWith('post/'))) {
    return 'post';
  }
  if (normalized.some((key) => key === 'profile' || key.startsWith('profile/'))) {
    return 'profile';
  }
  return null;
}

function readExecuteSetKeys(args: Record<string, unknown> | null): string[] {
  if (!args) return [];
  const request =
    args.request && typeof args.request === 'object'
      ? (args.request as Record<string, unknown>)
      : args;
  const action =
    request.action && typeof request.action === 'object'
      ? (request.action as Record<string, unknown>)
      : null;
  if (!action) return [];
  const type = typeof action.type === 'string' ? action.type.trim() : '';
  if (type && type !== 'set') return [];
  const data =
    action.data && typeof action.data === 'object' && !Array.isArray(action.data)
      ? (action.data as Record<string, unknown>)
      : null;
  return data ? Object.keys(data) : [];
}

function formatRoutingSummary(config: unknown): string {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'No routing';
  }
  const record = config as Record<string, unknown>;
  const readBps = (field: string): number =>
    typeof record[field] === 'number' && Number.isFinite(record[field])
      ? (record[field] as number)
      : 0;
  const treasury = readBps('treasury_bps');
  const season = readBps('season_pool_bps');
  const target = readBps('target_bps');
  const burn = readBps('burn_bps');
  return `${(treasury / 100).toFixed(0)}% treasury · ${(season / 100).toFixed(0)}% season · ${(target / 100).toFixed(0)}% target · ${(burn / 100).toFixed(0)}% burn`;
}

function getFunctionCallShape(kind: Record<string, unknown> | undefined): {
  receiverId: string | null;
  methodName: string | null;
  ownershipTarget: string | null;
  amountYocto: string | null;
  codeHash: string | null;
  actionId: string | null;
  seasonId: string | null;
  transferCallMsg: string | null;
  transferCallReceiverId: string | null;
  months: number | null;
  executeSetKeys: string[];
  config: Record<string, unknown> | null;
  seasonLabel: string | null;
} {
  const empty = {
    receiverId: null,
    methodName: null,
    ownershipTarget: null,
    amountYocto: null,
    codeHash: null,
    actionId: null,
    seasonId: null,
    transferCallMsg: null,
    transferCallReceiverId: null,
    months: null,
    executeSetKeys: [] as string[],
    config: null,
    seasonLabel: null,
  };
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') return empty;
  const payload = functionCall as Record<string, unknown>;
  const receiverId = readStringField(payload, 'receiver_id');
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const firstAction =
    actions[0] && typeof actions[0] === 'object'
      ? (actions[0] as Record<string, unknown>)
      : null;
  const methodName = firstAction
    ? readStringField(firstAction, 'method_name')
    : null;
  const args = firstAction ? decodeFunctionCallArgs(firstAction.args) : null;
  const config =
    args?.config &&
    typeof args.config === 'object' &&
    !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : null;
  const msg = readStringField(args, 'msg');
  const fundMsg = parseFundSeasonPoolTransferMsg(msg);
  const monthsRaw = args?.months;
  const months =
    typeof monthsRaw === 'number' && Number.isFinite(monthsRaw)
      ? monthsRaw
      : typeof monthsRaw === 'string' && /^\d+$/.test(monthsRaw.trim())
        ? Number(monthsRaw.trim())
        : null;
  return {
    receiverId,
    methodName,
    ownershipTarget:
      readStringField(args, 'owner_id') ??
      readStringField(args, 'new_owner_id') ??
      readStringField(args, 'account_id') ??
      readStringField(args, 'new_owner'),
    amountYocto: readStringField(args, 'amount'),
    codeHash:
      readStringField(args, 'code_hash') ?? readStringField(args, 'hash'),
    actionId: readStringField(args, 'action_id'),
    seasonId:
      readStringField(args, 'season_id') ??
      fundMsg.seasonId ??
      readStringField(config, 'season_id'),
    transferCallMsg: msg,
    transferCallReceiverId: readStringField(args, 'receiver_id'),
    months,
    executeSetKeys: readExecuteSetKeys(args),
    config,
    seasonLabel:
      readStringField(args, 'label') ?? readStringField(config, 'label'),
  };
}

/**
 * Slim kind-aware headlines/targets for Protocol cards (portal subset).
 */
export function deriveProtocolProposalPresentation({
  kind,
  description,
  proposer,
  fallbackHeadline,
  fallbackBadge,
}: {
  kind: Record<string, unknown> | null | undefined;
  description: string | null | undefined;
  proposer: string | null | undefined;
  fallbackHeadline?: string | null;
  fallbackBadge?: string | null;
}): ProtocolProposalPresentation {
  const onChainDescription = description?.trim() || null;
  const normalizedProposer = proposer?.trim() || null;
  const kindKey =
    kind && typeof kind === 'object' ? Object.keys(kind)[0] || null : null;
  const kindPayload =
    kindKey && kind ? (kind as Record<string, unknown>)[kindKey] : null;
  const onChainFields = resolveOnChainActionFields(
    kind && typeof kind === 'object'
      ? (kind as Record<string, unknown>)
      : null,
    kindKey
  );
  const finish = (
    partial: Partial<ProtocolProposalPresentation> & {
      headline: string;
    }
  ): ProtocolProposalPresentation => {
    const actionBadge = partial.actionBadge ?? fallbackBadge ?? null;
    return {
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: null,
      subjectText: null,
      subjectEyebrow: null,
      showProposerSeparately: false,
      showProposerAsSelf: false,
      ...partial,
      actionBadge,
      family:
        partial.family ?? protocolProposalFamilyFromBadge(actionBadge),
      ...onChainFields,
    };
  };

  if (!kindKey) {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        'Governance proposal',
      actionBadge: fallbackBadge ?? null,
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  // Placeholder for Sputnik last_proposal_id gaps — id existed, body gone.
  if (kindKey === 'Removed') {
    return finish({
      headline: 'Removed from chain',
      actionBadge: 'Removed',
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: null,
      subjectText: null,
      subjectEyebrow: null,
      showProposerSeparately: false,
      showProposerAsSelf: false,
    });
  }

  if (kindKey === 'AddMemberToRole' || kindKey === 'RemoveMemberFromRole') {
    const memberId = readStringField(kindPayload, 'member_id');
    const roleId = readStringField(kindPayload, 'role');
    const roleName = roleId ? formatRoleDisplayName(roleId) : null;
    const verb = kindKey === 'AddMemberToRole' ? 'Add to' : 'Remove from';
    const sameAsProposer = Boolean(
      normalizedProposer &&
        memberId &&
        normalizedProposer.toLowerCase() === memberId.toLowerCase()
    );
    return finish({
      headline: roleName
        ? `${verb} ${roleName}`
        : memberId
          ? `${verb} ${memberId}`
          : (firstDescriptionLine(onChainDescription) ?? 'Membership proposal'),
      actionBadge: kindKey === 'AddMemberToRole' ? 'Join' : 'Leave',
      targetKind: roleName ? 'role' : null,
      targetValue: roleName,
      targetAccountId: null,
      subjectAccount: memberId,
      subjectEyebrow: memberId ? 'Member' : null,
      showProposerSeparately: Boolean(
        normalizedProposer && memberId && !sameAsProposer
      ),
      showProposerAsSelf: sameAsProposer,
    });
  }

  if (kindKey === 'Transfer') {
    const receiverId = readStringField(kindPayload, 'receiver_id');
    const amount = readStringField(kindPayload, 'amount');
    const tokenId = readStringField(kindPayload, 'token_id');
    const amountLabel = amount
      ? formatTransferAmountLabel(amount, tokenId)
      : null;
    return finish({
      headline:
        amountLabel && receiverId
          ? `Send ${amountLabel} to ${receiverId}`
          : receiverId
            ? `Treasury transfer to ${receiverId}`
            : 'Treasury transfer',
      actionBadge: 'Transfer',
      targetKind: amountLabel ? 'amount' : null,
      targetValue: amountLabel,
      targetAccountId: null,
      subjectAccount: receiverId ?? normalizedProposer,
      subjectEyebrow: receiverId ? 'To' : null,
      showProposerSeparately: Boolean(
        normalizedProposer &&
          receiverId &&
          normalizedProposer.toLowerCase() !== receiverId.toLowerCase()
      ),
    });
  }

  if (kindKey === 'FunctionCall') {
    const shape = getFunctionCallShape(
      kind && typeof kind === 'object'
        ? (kind as Record<string, unknown>)
        : undefined
    );
    const contractLabel = shortContractName(shape.receiverId);
    const methodLabel = formatMethodLabel(shape.methodName);
    const fundMsg = parseFundSeasonPoolTransferMsg(shape.transferCallMsg);

    if (
      (shape.methodName === 'set_owner' ||
        shape.methodName === 'transfer_ownership') &&
      (contractLabel || shape.ownershipTarget)
    ) {
      return finish({
        headline:
          contractLabel && shape.ownershipTarget
            ? `Transfer ${contractLabel} ownership to ${shape.ownershipTarget}`
            : contractLabel
              ? `Transfer ${contractLabel} ownership`
              : 'Transfer contract ownership',
        actionBadge: 'Ownership',
        targetKind: 'contract',
        targetValue: contractLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.ownershipTarget ?? shape.receiverId,
        subjectEyebrow: shape.ownershipTarget ? 'To' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (shape.methodName === 'withdraw_infra') {
      const amountLabel = shape.amountYocto
        ? `${yoctoToSocial(shape.amountYocto)} SOCIAL`
        : null;
      const treasuryId = shape.transferCallReceiverId;
      const treasuryLabel = shortContractName(treasuryId);
      const treasuryHeadline =
        treasuryLabel &&
        treasuryLabel.charAt(0).toUpperCase() + treasuryLabel.slice(1);
      return finish({
        headline:
          amountLabel && treasuryHeadline
            ? `Withdraw ${amountLabel} · infra pool → ${treasuryHeadline}`
            : amountLabel
              ? `Withdraw ${amountLabel} from infra pool`
              : 'Withdraw infra pool',
        actionBadge: 'Treasury',
        targetKind: amountLabel ? 'amount' : null,
        targetValue: amountLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: treasuryId,
        subjectEyebrow: treasuryId ? 'To' : null,
        showProposerSeparately: Boolean(
          normalizedProposer &&
            treasuryId &&
            normalizedProposer.toLowerCase() !== treasuryId.toLowerCase()
        ),
      });
    }

    if (shape.methodName === 'withdraw_treasury') {
      const amountLabel = shape.amountYocto
        ? `${yoctoToSocial(shape.amountYocto)} SOCIAL`
        : null;
      return finish({
        headline: amountLabel
          ? `Sweep ${amountLabel} from social spend`
          : contractLabel
            ? `Sweep ${contractLabel} treasury fees`
            : 'Sweep social-spend treasury fees',
        actionBadge: 'Treasury',
        targetKind: amountLabel ? 'amount' : 'contract',
        targetValue: amountLabel ?? contractLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.receiverId,
        subjectEyebrow: 'From',
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (
      shape.methodName === 'fund_season_pool_from_treasury' ||
      (shape.methodName === 'ft_transfer_call' &&
        isSocialTokenContract(shape.receiverId) &&
        (shape.seasonId || fundMsg.seasonId) &&
        (fundMsg.action === 'fund_season_pool' || !fundMsg.action))
    ) {
      const seasonId = shape.seasonId ?? fundMsg.seasonId;
      const amountLabel = shape.amountYocto
        ? `${yoctoToSocial(shape.amountYocto)} SOCIAL`
        : null;
      return finish({
        headline:
          seasonId && amountLabel
            ? `Fund ${seasonId} with ${amountLabel}`
            : seasonId
              ? `Fund ${seasonId} rally pool`
              : 'Fund rally pool from treasury',
        actionBadge: 'Treasury',
        targetKind: amountLabel ? 'amount' : 'season',
        targetValue: amountLabel ?? seasonId,
        subjectText: seasonId,
        subjectEyebrow: seasonId ? 'Season' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    const boostMsg = parseBoostLockTransferMsg(shape.transferCallMsg);
    if (
      shape.methodName === 'ft_transfer_call' &&
      isSocialTokenContract(shape.receiverId) &&
      isBoostContract(shape.transferCallReceiverId) &&
      boostMsg.action === 'lock'
    ) {
      const amountLabel = shape.amountYocto
        ? `${yoctoToSocial(shape.amountYocto)} SOCIAL`
        : null;
      const monthsLabel =
        boostMsg.months != null ? `${boostMsg.months} mo` : null;
      return finish({
        headline:
          amountLabel && monthsLabel
            ? `Boost lock ${amountLabel} for ${monthsLabel}`
            : amountLabel
              ? `Boost lock ${amountLabel}`
              : 'Boost lock from treasury',
        actionBadge: 'Boost',
        targetKind: amountLabel ? 'amount' : 'contract',
        targetValue: amountLabel ?? shortContractName(BOOST_CONTRACT),
        targetAccountId: BOOST_CONTRACT,
        subjectAccount: BOOST_CONTRACT,
        subjectEyebrow: 'Boost',
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (
      isBoostContract(shape.receiverId) &&
      (shape.methodName === 'claim_rewards' ||
        shape.methodName === 'unlock' ||
        shape.methodName === 'renew_lock' ||
        shape.methodName === 'extend_lock')
    ) {
      const method = shape.methodName;
      const headline =
        method === 'claim_rewards'
          ? 'Collect Boost rewards'
          : method === 'unlock'
            ? 'Unlock Boost position'
            : method === 'renew_lock'
              ? 'Renew Boost lock'
              : shape.months != null
                ? `Extend Boost lock to ${shape.months} mo`
                : 'Extend Boost lock';
      return finish({
        headline,
        actionBadge: 'Boost',
        targetKind: 'contract',
        targetValue: shortContractName(BOOST_CONTRACT),
        targetAccountId: BOOST_CONTRACT,
        subjectAccount: BOOST_CONTRACT,
        subjectEyebrow: 'Boost',
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (shape.methodName === 'set_action_config' && shape.actionId) {
      const routingSummary = formatRoutingSummary(shape.config);
      const actionLabel = shape.actionId.replace(/_/g, ' ');
      return finish({
        headline: contractLabel
          ? `Set ${contractLabel} ${actionLabel} routing`
          : `Set ${actionLabel} routing`,
        actionBadge: 'Config',
        targetKind: 'routing',
        targetValue: routingSummary,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.receiverId,
        subjectEyebrow: shape.receiverId ? 'Contract' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (shape.methodName === 'set_season_config') {
      const seasonId = shape.seasonId;
      const label = shape.seasonLabel;
      return finish({
        headline: label
          ? `Configure season ${label}`
          : seasonId
            ? `Configure season ${seasonId}`
            : 'Configure rally season',
        actionBadge: 'Season',
        targetKind: 'season',
        targetValue: label ?? seasonId,
        subjectText: seasonId,
        subjectEyebrow: seasonId ? 'Season' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (
      shape.methodName === 'update_contract' ||
      shape.methodName === 'update_contract_from_hash' ||
      shape.codeHash
    ) {
      return finish({
        headline:
          firstDescriptionLine(onChainDescription) ??
          fallbackHeadline?.trim() ??
          (contractLabel ? `Upgrade ${contractLabel}` : 'Upgrade contract'),
        actionBadge: 'Upgrade',
        targetKind: shape.codeHash ? 'code_hash' : 'contract',
        targetValue: shape.codeHash
          ? `${shape.codeHash.slice(0, 10)}…`
          : contractLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.receiverId,
        subjectEyebrow: contractLabel ? 'Contract' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (shape.methodName === 'set_infra_withdraw_authority') {
      return finish({
        headline: shape.ownershipTarget
          ? `Delegate boost infra withdraw to ${shortContractName(shape.ownershipTarget) ?? shape.ownershipTarget}`
          : contractLabel
            ? `Clear ${contractLabel} infra withdraw delegate`
            : 'Update boost infra withdraw delegate',
        actionBadge: 'Boost',
        targetKind: 'contract',
        targetValue: contractLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.ownershipTarget,
        subjectEyebrow: shape.ownershipTarget ? 'Authority' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (
      isSocialSpendContract(shape.receiverId) &&
      shape.methodName === 'claim_target_balance'
    ) {
      return finish({
        headline: 'Claim support to treasury',
        actionBadge: 'Support',
        targetKind: null,
        targetValue: null,
        targetAccountId: null,
        subjectAccount: normalizedProposer,
        subjectEyebrow: normalizedProposer ? 'Proposer' : null,
        showProposerSeparately: false,
      });
    }

    if (isCoreContract(shape.receiverId) && shape.methodName === 'execute') {
      const faceKind = classifyCoreExecuteSetKeys(shape.executeSetKeys);
      if (faceKind === 'mood') {
        return finish({
          headline: 'Update mood',
          actionBadge: 'Mood',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          subjectAccount: normalizedProposer,
          subjectEyebrow: normalizedProposer ? 'Proposer' : null,
          showProposerSeparately: false,
        });
      }
      if (faceKind === 'post') {
        return finish({
          headline: 'Publish as DAO',
          actionBadge: 'Post',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          subjectAccount: normalizedProposer,
          subjectEyebrow: normalizedProposer ? 'Proposer' : null,
          showProposerSeparately: false,
        });
      }
      if (faceKind === 'profile') {
        return finish({
          headline: 'Update profile',
          actionBadge: 'Profile',
          targetKind: null,
          targetValue: null,
          targetAccountId: null,
          subjectAccount: normalizedProposer,
          subjectEyebrow: normalizedProposer ? 'Proposer' : null,
          showProposerSeparately: false,
        });
      }
    }

    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        (methodLabel && contractLabel
          ? `${methodLabel} on ${contractLabel}`
          : methodLabel
            ? methodLabel
            : 'Function call'),
      actionBadge: 'Call',
      targetKind: contractLabel ? 'contract' : null,
      targetValue: contractLabel,
      targetAccountId: shape.receiverId,
      subjectAccount: shape.receiverId ?? normalizedProposer,
      subjectEyebrow: shape.receiverId ? 'Contract' : null,
      showProposerSeparately: Boolean(normalizedProposer && shape.receiverId),
    });
  }

  if (kindKey === 'ChangePolicyAddOrUpdateRole') {
    const role =
      kindPayload && typeof kindPayload === 'object'
        ? ((kindPayload as Record<string, unknown>).role as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const roleName = readStringField(role, 'name');
    const roleLabel = roleName ? formatRoleDisplayName(roleName) : null;
    return finish({
      headline: roleLabel
        ? `Update ${roleLabel} role`
        : (firstDescriptionLine(onChainDescription) ?? 'Update DAO role'),
      actionBadge: 'Role',
      targetKind: roleLabel ? 'role' : null,
      targetValue: roleLabel,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'ChangePolicyRemoveRole') {
    const roleId = readStringField(kindPayload, 'role');
    const roleLabel = roleId ? formatRoleDisplayName(roleId) : null;
    return finish({
      headline: roleLabel ? `Remove ${roleLabel}` : 'Remove DAO role',
      actionBadge: 'Remove role',
      targetKind: roleLabel ? 'role' : null,
      targetValue: roleLabel,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'ChangePolicyUpdateParameters') {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ?? 'Update DAO parameters',
      actionBadge: 'Parameters',
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'ChangePolicyUpdateDefaultVotePolicy') {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ?? 'Update vote policy',
      actionBadge: 'Vote policy',
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'ChangeConfig') {
    return finish({
      headline: firstDescriptionLine(onChainDescription) ?? 'Update DAO config',
      actionBadge: 'Config',
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'Vote') {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        'Signal',
      actionBadge: 'Signal',
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'SetStakingContract') {
    const stakingId = readStringField(kindPayload, 'staking_id');
    const contractLabel = shortContractName(stakingId);
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        (contractLabel
          ? `Set ${contractLabel} for voting`
          : 'Set staking contract'),
      actionBadge: 'Staking',
      targetKind: 'contract',
      targetValue: contractLabel ?? stakingId,
      targetAccountId: stakingId,
      subjectAccount: normalizedProposer,
      subjectEyebrow: normalizedProposer ? 'Proposer' : null,
      showProposerSeparately: false,
    });
  }

  return finish({
    headline:
      firstDescriptionLine(onChainDescription) ??
      fallbackHeadline?.trim() ??
      `${kindKey} proposal`,
    actionBadge: fallbackBadge ?? null,
    targetKind: null,
    targetValue: null,
    targetAccountId: null,
    subjectAccount: normalizedProposer,
    subjectEyebrow: normalizedProposer ? 'Proposer' : null,
    showProposerSeparately: false,
  });
}
