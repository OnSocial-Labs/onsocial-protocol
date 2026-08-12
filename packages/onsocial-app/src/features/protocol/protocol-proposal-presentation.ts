import { SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { yoctoToSocial } from '@/lib/format-social-balance';

export type ProtocolProposalTargetKind =
  | 'role'
  | 'community'
  | 'contract'
  | 'amount'
  | 'code_hash'
  | null;

export interface ProtocolProposalPresentation {
  headline: string;
  actionBadge: string | null;
  targetKind: ProtocolProposalTargetKind;
  targetValue: string | null;
  targetAccountId: string | null;
  subjectAccount: string | null;
  subjectEyebrow: string | null;
  showProposerSeparately: boolean;
}

function readStringField(
  payload: unknown,
  key: string
): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstDescriptionLine(description: string | null | undefined): string | null {
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

function shortContractName(accountId: string | null | undefined): string | null {
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

function getFunctionCallShape(kind: Record<string, unknown> | undefined): {
  receiverId: string | null;
  methodName: string | null;
  ownershipTarget: string | null;
  amountYocto: string | null;
  codeHash: string | null;
} {
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return {
      receiverId: null,
      methodName: null,
      ownershipTarget: null,
      amountYocto: null,
      codeHash: null,
    };
  }
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
  return {
    receiverId,
    methodName,
    ownershipTarget:
      readStringField(args, 'owner_id') ??
      readStringField(args, 'new_owner_id') ??
      readStringField(args, 'account_id'),
    amountYocto: readStringField(args, 'amount'),
    codeHash:
      readStringField(args, 'code_hash') ?? readStringField(args, 'hash'),
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
  const finish = (
    partial: Omit<ProtocolProposalPresentation, 'actionBadge'> & {
      actionBadge?: string | null;
    }
  ): ProtocolProposalPresentation => ({
    ...partial,
    actionBadge: partial.actionBadge ?? fallbackBadge ?? null,
  });

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

  if (kindKey === 'AddMemberToRole' || kindKey === 'RemoveMemberFromRole') {
    const memberId = readStringField(kindPayload, 'member_id');
    const roleId = readStringField(kindPayload, 'role');
    const roleName = roleId ? formatRoleDisplayName(roleId) : null;
    const verb = kindKey === 'AddMemberToRole' ? 'Add to' : 'Remove from';
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
        normalizedProposer &&
          memberId &&
          normalizedProposer.toLowerCase() !== memberId.toLowerCase()
      ),
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

    if (shape.methodName === 'withdraw_treasury' || shape.methodName === 'withdraw_infra') {
      const amountLabel = shape.amountYocto
        ? `${yoctoToSocial(shape.amountYocto)} SOCIAL`
        : null;
      const verb =
        shape.methodName === 'withdraw_infra' ? 'Withdraw' : 'Sweep';
      return finish({
        headline: amountLabel
          ? `${verb} ${amountLabel}`
          : contractLabel
            ? `${verb} ${contractLabel}`
            : `${verb} treasury`,
        actionBadge: 'Treasury',
        targetKind: amountLabel ? 'amount' : 'contract',
        targetValue: amountLabel ?? contractLabel,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.receiverId,
        subjectEyebrow: 'From',
        showProposerSeparately: Boolean(normalizedProposer),
      });
    }

    if (shape.codeHash) {
      return finish({
        headline:
          firstDescriptionLine(onChainDescription) ??
          fallbackHeadline?.trim() ??
          (contractLabel
            ? `Upgrade ${contractLabel}`
            : 'Upgrade contract'),
        actionBadge: 'Upgrade',
        targetKind: 'code_hash',
        targetValue: `${shape.codeHash.slice(0, 10)}…`,
        targetAccountId: shape.receiverId,
        subjectAccount: shape.receiverId,
        subjectEyebrow: contractLabel ? 'Contract' : null,
        showProposerSeparately: Boolean(normalizedProposer),
      });
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
      headline:
        firstDescriptionLine(onChainDescription) ?? 'Update DAO config',
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
