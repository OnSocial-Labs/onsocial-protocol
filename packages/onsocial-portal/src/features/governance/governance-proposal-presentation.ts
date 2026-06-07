import { formatDaoRoleDisplayName } from '@/features/governance/governance-proposal-builders';
import { yoctoToNear, yoctoToSocial } from '@/lib/near-rpc';

export type ProposalTargetKind = 'role' | 'community' | 'contract' | 'amount';

export const PROPOSAL_TARGET_KIND_LABELS: Record<ProposalTargetKind, string> =
  {
    role: 'Role',
    community: 'Community',
    contract: 'Contract',
    amount: 'Amount',
  };

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
    targetAccountId:
      targetKind === 'contract' && accountId ? accountId : null,
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

function formatTransferAmountLabel(
  amount: string,
  tokenId: string | null
): string {
  const normalizedToken = tokenId?.trim().toLowerCase() ?? '';
  if (!normalizedToken) {
    return `${yoctoToNear(amount)} NEAR`;
  }

  if (normalizedToken.includes('social')) {
    return `${yoctoToSocial(amount)} SOCIAL`;
  }

  const shortToken = shortContractName(tokenId) ?? 'tokens';
  return `${yoctoToSocial(amount)} ${shortToken}`;
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
  Vote: 'Idea',
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
};

function getProposalKindKey(
  kind: Record<string, unknown> | null | undefined
): string | null {
  if (!kind) {
    return null;
  }

  const keys = Object.keys(kind);
  return keys[0] ?? null;
}

function readStringField(
  value: unknown,
  field: string
): string | null {
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
} {
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return { receiverId: null, methodName: null, config: null };
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
    args?.config && typeof args.config === 'object' && !Array.isArray(args.config)
      ? (args.config as Record<string, unknown>)
      : null;

  return { receiverId, methodName, config };
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

function firstDescriptionLine(description: string | null | undefined): string | null {
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
  if (!kindPayload || typeof kindPayload !== 'object' || Array.isArray(kindPayload)) {
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
  const permissions = Array.isArray((role as Record<string, unknown>).permissions)
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
  presentation: Omit<PresentationCore, 'subjectAccount' | 'showProposerSeparately'>,
  proposer: string | null
): PresentationCore {
  return {
    ...presentation,
    subjectAccount: proposer,
    showProposerSeparately: false,
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

  return {
    headline,
    actionBadge,
    ...proposalTarget('contract', contractLabel ?? receiverId, receiverId),
    subjectAccount: proposerDiffersFromReceiver
      ? normalizedProposer
      : receiverId,
    onChainDescription,
    proposer: normalizedProposer,
    showProposerSeparately: false,
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
  onChainDescription: string | null;
  proposer: string | null;
  showProposerSeparately: boolean;
  /** Policy permission key (e.g. add_member_to_role) or contract method_name. */
  onChainAction: string | null;
  onChainActionKind: 'policy' | 'method' | null;
};

type PresentationCore = Omit<
  ProposalPresentation,
  'onChainAction' | 'onChainActionKind'
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
  kind: Record<string, unknown> | null | undefined;
  description: string | null | undefined;
  proposer: string | null | undefined;
  fallbackHeadline?: string | null;
}): ProposalPresentation {
  const onChainDescription = description?.trim() || null;
  const normalizedProposer = proposer?.trim() || null;
  const kindKey = getProposalKindKey(kind);
  const actionBadge = kindKey ? (GENERIC_KIND_BADGES[kindKey] ?? null) : null;
  const onChainFields = resolveOnChainActionFields(kind, kindKey);
  const finish = (presentation: PresentationCore): ProposalPresentation => ({
    ...presentation,
    ...onChainFields,
  });

  if (!kindKey || !kind) {
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
      onChainDescription,
      proposer: normalizedProposer,
      showProposerSeparately: false,
    });
  }

  const kindPayload = kind[kindKey];

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
      onChainDescription,
      proposer: normalizedProposer,
      showProposerSeparately:
        !!normalizedProposer &&
        !!memberId &&
        normalizedProposer.toLowerCase() !== memberId.toLowerCase(),
    });
  }

  if (kindKey === 'FunctionCall') {
    const { receiverId, methodName, config } = getFunctionCallShape(kind);
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
      return finish({
        headline,
        actionBadge: 'Partner',
        ...proposalTarget('community', appLabel ?? appId),
        subjectAccount,
        onChainDescription,
        proposer: normalizedProposer,
        showProposerSeparately:
          !!normalizedProposer &&
          !!subjectAccount &&
          normalizedProposer.toLowerCase() !== subjectAccount.toLowerCase(),
      });
    }

    if (
      methodName === 'update_contract' ||
      methodName === 'update_contract_from_hash'
    ) {
      headline = contractLabel ? `Upgrade ${contractLabel}` : 'Upgrade contract';
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
      onChainDescription: transferDescription,
      proposer: normalizedProposer,
      showProposerSeparately:
        !!normalizedProposer &&
        !!receiverId &&
        normalizedProposer.toLowerCase() !== receiverId.toLowerCase(),
    });
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

    return finish(withProposerSubject(
      {
        headline: classified.headline,
        actionBadge: classified.actionBadge,
        ...proposalTarget('role', roleLabel),
        onChainDescription,
        proposer: normalizedProposer,
      },
      normalizedProposer
    ));
  }

  if (kindKey === 'ChangePolicyRemoveRole') {
    const roleId = readStringField(kindPayload, 'role');
    const roleName = roleId ? formatDaoRoleDisplayName(roleId) : null;
    const headline = roleName ? `Remove ${roleName}` : 'Remove DAO role';

    return finish(withProposerSubject(
      {
        headline,
        actionBadge: 'Remove role',
        ...proposalTarget('role', roleName),
        onChainDescription,
        proposer: normalizedProposer,
      },
      normalizedProposer
    ));
  }

  if (kindKey === 'ChangePolicyUpdateParameters') {
    return finish(withProposerSubject(
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
    ));
  }

  if (kindKey === 'ChangePolicyUpdateDefaultVotePolicy') {
    return finish(withProposerSubject(
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
    ));
  }

  if (kindKey === 'ChangePolicy' || kindKey === 'ChangeConfig') {
    return finish(withProposerSubject(
      {
        headline:
          firstDescriptionLine(onChainDescription) ??
          (kindKey === 'ChangeConfig' ? 'Update config' : 'DAO policy change'),
        actionBadge: actionBadge ?? 'Policy',
        targetKind: null,
        targetValue: null,
        targetAccountId: null,
        onChainDescription,
        proposer: normalizedProposer,
      },
      normalizedProposer
    ));
  }

  if (kindKey === 'Vote') {
    return finish({
      headline:
        firstDescriptionLine(onChainDescription) ??
        fallbackHeadline?.trim() ??
        'Signaling proposal',
      actionBadge,
      targetKind: null,
      targetValue: null,
      targetAccountId: null,
      subjectAccount: normalizedProposer,
      onChainDescription,
      proposer: normalizedProposer,
      showProposerSeparately: false,
    });
  }

  if (kindKey === 'UpgradeSelf' || kindKey === 'UpgradeRemote') {
    return finish(withProposerSubject(
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
    ));
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
    onChainDescription,
    proposer: normalizedProposer,
    showProposerSeparately: false,
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
      /Description:\s*(.+?)(?:\.\s*(?:Reward per action|Daily cap|Total budget)|$)/i
    );
    if (descriptionField?.[1]?.trim()) {
      return descriptionField[1].trim();
    }
  }

  return appText || onChainText || null;
}

function resolveFeedProposalKind(
  feedProposal: { kind?: Record<string, unknown> | null; payload?: unknown } | null
): Record<string, unknown> | null {
  if (feedProposal?.kind && typeof feedProposal.kind === 'object') {
    return feedProposal.kind;
  }

  const payload = feedProposal?.payload;
  if (!payload || typeof payload !== 'object' || !('proposal' in payload)) {
    return null;
  }

  const proposal = payload.proposal;
  if (
    !proposal ||
    typeof proposal !== 'object' ||
    !('kind' in proposal) ||
    typeof proposal.kind !== 'object' ||
    proposal.kind === null
  ) {
    return null;
  }

  return proposal.kind as Record<string, unknown>;
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
    return {
      kind: feedProposal.snapshot.kind,
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
  fallback?: { label?: string | null; description?: string | null }
): ProposalPresentation {
  if (!proposal) {
    return deriveProposalPresentation({
      kind: null,
      description: fallback?.description,
      proposer: null,
      fallbackHeadline: fallback?.label,
    });
  }

  return deriveProposalPresentation({
    kind: proposal.kind,
    description: proposal.description,
    proposer: proposal.proposer,
    fallbackHeadline: fallback?.label,
  });
}
