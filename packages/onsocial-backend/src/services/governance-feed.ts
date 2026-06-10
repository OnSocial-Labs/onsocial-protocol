import { randomBytes } from 'crypto';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { viewContractAt } from './near.js';
import {
  isTerminalDaoProposalStatus,
  type GovernanceDaoPolicySnapshot,
} from './governance-proposal-policy-snapshot.js';
import { ensureDaoProposalsSynced } from './governance-dao-proposal-sync.js';
import { loadAllDaoProposalSnapshots } from './governance-dao-proposal-store.js';
import { loadPersistedPolicySnapshotsByProposalIds } from './governance-proposal-policy-store.js';
import {
  isRewardsAppRegistered,
  type GovernanceProposalPayload,
} from './governance-proposals.js';

const REJECTED_GOVERNANCE_STATUSES = new Set(['Rejected', 'Removed']);
const REOPENED_GOVERNANCE_STATUSES = new Set(['Expired']);

export type GovernanceFeedScope = 'all' | 'partners' | 'protocol';

type GovernanceDaoProposalRecord = {
  id?: number;
  proposer?: string;
  description?: string;
  kind?: Record<string, unknown>;
  status?: string;
  submission_time?: string;
  vote_counts?: Record<string, [string, string, string]>;
  votes?: Record<string, string>;
  last_actions_log?: Array<{ block_height: string }>;
};

type GovernanceDaoProposalSnapshot = {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: string;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, string>;
  submission_time: string;
  resolved_at?: string | null;
  last_actions_log?: Array<{ block_height: string }>;
  policy_snapshot?: GovernanceDaoPolicySnapshot | null;
};

type ProtocolGovernanceKind =
  | 'upgrade'
  | 'treasury'
  | 'permissions'
  | 'config'
  | 'staking'
  | 'signaling';

type PublicGovernanceApplication = {
  app_id: string;
  label: string;
  status: string;
  wallet_id: string | null;
  description: string | null;
  website_url: string | null;
  telegram_handle: string | null;
  x_handle: string | null;
  created_at: string;
  governance_scope: 'partners' | 'protocol';
  protocol_kind?: ProtocolGovernanceKind;
  protocol_subject?: string;
  protocol_target_account?: string | null;
  protocol_target_method?: string | null;
  governance_proposal: {
    proposal_id: number | null;
    status: string;
    proposer?: string | null;
    description: string | null;
    dao_account: string;
    tx_hash: string | null;
    submitted_at: string | null;
    kind?: Record<string, unknown> | null;
    snapshot?: GovernanceDaoProposalSnapshot | null;
  } | null;
};

type PublicGovernanceProposal = NonNullable<
  PublicGovernanceApplication['governance_proposal']
>;

type GovernanceSyncRow = {
  app_id: string;
  status: string;
  api_key?: string | null;
  governance_proposal_id?: number | string | null;
  governance_proposal_status?: string | null;
  governance_proposal_dao?: string | null;
};

function generateApiKey(): string {
  return `os_live_${randomBytes(32).toString('hex')}`;
}

function mapDaoProposalSnapshot(
  proposal: GovernanceDaoProposalRecord,
  policySnapshot: GovernanceDaoPolicySnapshot | null = null
): GovernanceDaoProposalSnapshot | null {
  if (typeof proposal.id !== 'number' || proposal.id < 0) {
    return null;
  }

  return {
    id: proposal.id,
    proposer: proposal.proposer ?? '',
    description: proposal.description ?? '',
    kind: proposal.kind ?? {},
    status: proposal.status ?? 'Unknown',
    vote_counts: proposal.vote_counts ?? {},
    votes: proposal.votes ?? {},
    submission_time: proposal.submission_time ?? '',
    last_actions_log: proposal.last_actions_log,
    policy_snapshot: policySnapshot,
  };
}

function buildGovernanceProposalFromRecord(
  proposal: GovernanceDaoProposalRecord,
  daoAccountId: string,
  overrides?: Partial<PublicGovernanceProposal>
): PublicGovernanceProposal {
  const description = proposal.description?.trim() || null;
  const snapshot = mapDaoProposalSnapshot(proposal);

  return {
    proposal_id: proposal.id ?? null,
    status: proposal.status ?? 'Unknown',
    proposer: proposal.proposer ?? null,
    description,
    dao_account: daoAccountId,
    tx_hash: null,
    submitted_at: proposal.submission_time ?? null,
    kind: proposal.kind ?? null,
    snapshot,
    ...overrides,
  };
}

function attachPersistedPolicySnapshot(
  app: PublicGovernanceApplication,
  policySnapshot: GovernanceDaoPolicySnapshot
): PublicGovernanceApplication {
  const proposal = app.governance_proposal;
  if (!proposal || proposal.proposal_id == null) {
    return app;
  }

  const currentSnapshot = proposal.snapshot;
  const mergedSnapshot: GovernanceDaoProposalSnapshot = currentSnapshot
    ? { ...currentSnapshot, policy_snapshot: policySnapshot }
    : {
        id: proposal.proposal_id,
        proposer: proposal.proposer ?? '',
        description: proposal.description ?? '',
        kind: proposal.kind ?? {},
        status: proposal.status,
        vote_counts: {},
        votes: {},
        submission_time: proposal.submitted_at ?? '',
        policy_snapshot: policySnapshot,
      };

  return {
    ...app,
    governance_proposal: {
      ...proposal,
      snapshot: mergedSnapshot,
    },
  };
}

async function hydrateDbOnlyPersistedPolicySnapshots(
  applications: PublicGovernanceApplication[],
  daoAccountId: string,
  scannedProposalIds: Set<number>
): Promise<PublicGovernanceApplication[]> {
  const missingProposalIds = applications
    .map((app) => {
      const proposal = app.governance_proposal;
      const proposalId = proposal?.proposal_id;
      const status = proposal?.snapshot?.status ?? proposal?.status;

      if (
        proposalId == null ||
        scannedProposalIds.has(proposalId) ||
        !isTerminalDaoProposalStatus(status) ||
        proposal?.snapshot?.policy_snapshot
      ) {
        return null;
      }

      return proposalId;
    })
    .filter((proposalId): proposalId is number => proposalId !== null);

  if (missingProposalIds.length === 0) {
    return applications;
  }

  const persistedByProposalId = await loadPersistedPolicySnapshotsByProposalIds(
    daoAccountId,
    missingProposalIds
  );

  if (persistedByProposalId.size === 0) {
    return applications;
  }

  return applications.map((app) => {
    const proposalId = app.governance_proposal?.proposal_id;
    if (
      proposalId == null ||
      app.governance_proposal?.snapshot?.policy_snapshot ||
      scannedProposalIds.has(proposalId)
    ) {
      return app;
    }

    const policySnapshot = persistedByProposalId.get(proposalId);
    if (!policySnapshot) {
      return app;
    }

    return attachPersistedPolicySnapshot(app, policySnapshot);
  });
}

export function enrichApplicationProposalSnapshot(
  app: PublicGovernanceApplication,
  snapshotsById: Map<number, GovernanceDaoProposalSnapshot>
): PublicGovernanceApplication {
  const proposal = app.governance_proposal;
  const proposalId = proposal?.proposal_id;

  if (!proposal || proposalId == null) {
    return app;
  }

  const enrichedSnapshot = snapshotsById.get(proposalId);
  if (!enrichedSnapshot) {
    return app;
  }

  const currentSnapshot = proposal.snapshot;
  const mergedSnapshot = currentSnapshot
    ? {
        ...currentSnapshot,
        ...enrichedSnapshot,
        policy_snapshot:
          enrichedSnapshot.policy_snapshot ?? currentSnapshot.policy_snapshot,
        resolved_at:
          enrichedSnapshot.resolved_at ?? currentSnapshot.resolved_at,
        vote_counts:
          enrichedSnapshot.vote_counts ?? currentSnapshot.vote_counts,
        votes: enrichedSnapshot.votes ?? currentSnapshot.votes,
        last_actions_log:
          enrichedSnapshot.last_actions_log ?? currentSnapshot.last_actions_log,
      }
    : enrichedSnapshot;

  return {
    ...app,
    governance_proposal: {
      ...proposal,
      kind: proposal.kind ?? mergedSnapshot.kind,
      snapshot: mergedSnapshot,
    },
  };
}

function parseGovernancePayload(
  value: GovernanceProposalPayload | string | null | undefined
): GovernanceProposalPayload | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return JSON.parse(value) as GovernanceProposalPayload;
  }

  return value;
}

export function mapGovernanceProposal(
  row: Record<string, unknown>,
  includePayload = false
):
  | (PublicGovernanceProposal & { payload?: GovernanceProposalPayload | null })
  | null {
  if (!row.governance_proposal_status) {
    return null;
  }

  const payload = parseGovernancePayload(
    row.governance_proposal_payload as
      | GovernanceProposalPayload
      | string
      | null
      | undefined
  );

  return {
    proposal_id:
      typeof row.governance_proposal_id === 'number'
        ? row.governance_proposal_id
        : row.governance_proposal_id === null ||
            row.governance_proposal_id === undefined
          ? null
          : Number(row.governance_proposal_id),
    status: String(row.governance_proposal_status),
    description:
      typeof row.governance_proposal_description === 'string'
        ? row.governance_proposal_description
        : null,
    dao_account: String(row.governance_proposal_dao ?? ''),
    tx_hash:
      typeof row.governance_proposal_tx_hash === 'string'
        ? row.governance_proposal_tx_hash
        : null,
    submitted_at:
      typeof row.governance_proposal_submitted_at === 'string'
        ? row.governance_proposal_submitted_at
        : null,
    ...(includePayload ? { payload } : {}),
  };
}

function mapPublicApplication(
  row: Record<string, unknown>
): PublicGovernanceApplication {
  return {
    app_id: String(row.app_id ?? ''),
    label: String(row.label ?? ''),
    status: String(row.status ?? ''),
    wallet_id: typeof row.wallet_id === 'string' ? row.wallet_id : null,
    description: typeof row.description === 'string' ? row.description : null,
    website_url: typeof row.website_url === 'string' ? row.website_url : null,
    telegram_handle:
      typeof row.telegram_handle === 'string' ? row.telegram_handle : null,
    x_handle: typeof row.x_handle === 'string' ? row.x_handle : null,
    created_at: String(row.created_at ?? ''),
    governance_scope: 'partners',
    governance_proposal: mapGovernanceProposal(row, true),
  };
}

function resolveProtocolAccount(name: string): string {
  return config.nearNetwork === 'mainnet'
    ? `${name}.onsocial.near`
    : `${name}.onsocial.testnet`;
}

function getAllowedProtocolReceivers(): Set<string> {
  return new Set([
    config.rewardsContract,
    resolveProtocolAccount('boost'),
    resolveProtocolAccount('core'),
    resolveProtocolAccount('scarces'),
    resolveProtocolAccount('token'),
    config.governanceDao,
  ]);
}

function getExcludedProtocolReceivers(): Set<string> {
  return new Set([
    resolveProtocolAccount('staking'),
    config.nearNetwork === 'mainnet'
      ? 'staking-governance.onsocial.near'
      : 'staking-governance.onsocial.testnet',
    config.nearNetwork === 'mainnet'
      ? 'staking-treasury.onsocial.near'
      : 'staking-treasury.onsocial.testnet',
  ]);
}

function parseSubmissionTimeToIso(value: string | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  try {
    const milliseconds = Number(BigInt(value) / 1_000_000n);
    if (!Number.isFinite(milliseconds)) {
      return new Date(0).toISOString();
    }

    return new Date(milliseconds).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function getProposalKindName(
  kind: Record<string, unknown> | undefined
): string {
  return Object.keys(kind ?? {})[0] ?? 'Unknown';
}

function getFunctionCallShape(kind: Record<string, unknown> | undefined): {
  receiverId: string | null;
  methodName: string | null;
  args: Record<string, unknown> | null;
} {
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return { receiverId: null, methodName: null, args: null };
  }

  const receiverId =
    'receiver_id' in functionCall &&
    typeof functionCall.receiver_id === 'string'
      ? functionCall.receiver_id
      : null;
  const actions =
    'actions' in functionCall && Array.isArray(functionCall.actions)
      ? functionCall.actions
      : [];
  const firstAction = actions[0];
  const methodName =
    firstAction &&
    typeof firstAction === 'object' &&
    'method_name' in firstAction &&
    typeof firstAction.method_name === 'string'
      ? firstAction.method_name
      : null;

  const args =
    firstAction &&
    typeof firstAction === 'object' &&
    'args' in firstAction &&
    typeof firstAction.args === 'string'
      ? parseDaoActionArgs(firstAction.args)
      : null;

  return { receiverId, methodName, args };
}

function parseDaoActionArgs(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function containsStakingKeyword(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('staking');
}

function isStakingProposal(
  proposal: GovernanceDaoProposalRecord,
  kindName: string,
  receiverId: string | null,
  methodName: string | null
): boolean {
  const excludedReceivers = getExcludedProtocolReceivers();
  return (
    kindName === 'SetStakingContract' ||
    excludedReceivers.has(receiverId ?? '') ||
    containsStakingKeyword(methodName) ||
    containsStakingKeyword(proposal.description)
  );
}

const DAO_ROLE_DISPLAY_NAMES: Record<string, string> = {
  delegated_proposers: 'Delegated proposers',
  guardians: 'Guardians',
};

function formatDaoRoleDisplayName(roleId: string): string {
  const normalized = roleId.trim();
  if (!normalized) {
    return '';
  }

  return DAO_ROLE_DISPLAY_NAMES[normalized] ?? normalized;
}

function readKindStringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function deriveProtocolProposalHeadline(
  proposal: GovernanceDaoProposalRecord
): string {
  const kindName = getProposalKindName(proposal.kind);
  const kindPayload = proposal.kind?.[kindName];
  const descriptionLine = proposal.description?.trim().split('\n')[0]?.trim();

  if (kindName === 'AddMemberToRole' || kindName === 'RemoveMemberFromRole') {
    const roleId = readKindStringField(kindPayload, 'role');
    const roleLabel = roleId ? formatDaoRoleDisplayName(roleId) : null;
    const verb = kindName === 'AddMemberToRole' ? 'Add to' : 'Remove from';
    if (roleLabel) {
      return `${verb} ${roleLabel}`;
    }
  }

  if (kindName === 'FunctionCall') {
    const { receiverId, methodName, args } = getFunctionCallShape(
      proposal.kind
    );
    const config =
      args?.config &&
      typeof args.config === 'object' &&
      !Array.isArray(args.config)
        ? (args.config as Record<string, unknown>)
        : null;
    const appLabel =
      config && typeof config.label === 'string' ? config.label.trim() : null;
    const appId =
      config && typeof config.app_id === 'string' ? config.app_id.trim() : null;

    if (methodName === 'register_app' && (appLabel || appId)) {
      return appLabel ?? appId ?? descriptionLine ?? 'Partner proposal';
    }

    if (
      methodName === 'update_contract' ||
      methodName === 'update_contract_from_hash'
    ) {
      return receiverId
        ? `Upgrade ${getProtocolSubject(receiverId)}`
        : 'Upgrade contract';
    }
  }

  if (kindName === 'Transfer') {
    return 'Treasury transfer';
  }

  if (kindName === 'ChangePolicyRemoveRole') {
    const roleId = readKindStringField(kindPayload, 'role');
    const roleLabel = roleId ? formatDaoRoleDisplayName(roleId) : null;
    if (roleLabel) {
      return `Remove ${roleLabel}`;
    }

    return 'Remove DAO role';
  }

  if (kindName === 'ChangePolicyAddOrUpdateRole') {
    const roleName =
      kindPayload &&
      typeof kindPayload === 'object' &&
      'role' in kindPayload &&
      kindPayload.role &&
      typeof kindPayload.role === 'object'
        ? readKindStringField(kindPayload.role, 'name')
        : null;
    const roleLabel = roleName ? formatDaoRoleDisplayName(roleName) : null;
    const normalizedDescription = descriptionLine?.toLowerCase() ?? '';

    if (
      normalizedDescription.includes('permission') ||
      normalizedDescription.includes('permissions')
    ) {
      return roleLabel
        ? `Update ${roleLabel} permissions`
        : 'Update DAO role permissions';
    }

    if (
      normalizedDescription.startsWith('add ') &&
      normalizedDescription.includes(' role')
    ) {
      return roleLabel ? `Add ${roleLabel} role` : 'Add DAO role';
    }

    if (roleLabel) {
      return `Update ${roleLabel}`;
    }
  }

  if (kindName === 'ChangePolicyUpdateParameters') {
    return descriptionLine || 'Update DAO parameters';
  }

  if (kindName === 'ChangePolicyUpdateDefaultVotePolicy') {
    return descriptionLine || 'Update vote policy';
  }

  if (kindName === 'SetStakingContract') {
    return descriptionLine || 'Set staking contract';
  }

  if (kindName === 'Vote') {
    return descriptionLine || 'Signal proposal';
  }

  return descriptionLine || 'Governance proposal';
}

function getProtocolSubject(accountId: string | null): string {
  if (!accountId) {
    return 'OnSocial protocol';
  }

  const subjects: Record<string, string> = {
    [config.rewardsContract]: 'Rewards contract',
    [resolveProtocolAccount('boost')]: 'Boost contract',
    [resolveProtocolAccount('core')]: 'Core contract',
    [resolveProtocolAccount('scarces')]: 'Scarces contract',
    [resolveProtocolAccount('token')]: 'Token contract',
    [config.governanceDao]: 'Governance DAO',
    [config.treasuryDao]: 'Treasury DAO',
  };

  return subjects[accountId] ?? accountId;
}

function getPartnerProposalDetails(proposal: GovernanceDaoProposalRecord): {
  appId: string | null;
  label: string | null;
} | null {
  const { receiverId, methodName, args } = getFunctionCallShape(proposal.kind);

  if (receiverId !== config.rewardsContract || methodName !== 'register_app') {
    return null;
  }

  const configValue = args?.config;
  if (
    configValue &&
    typeof configValue === 'object' &&
    !Array.isArray(configValue)
  ) {
    const appId =
      'app_id' in configValue && typeof configValue.app_id === 'string'
        ? configValue.app_id
        : null;
    const label =
      'label' in configValue && typeof configValue.label === 'string'
        ? configValue.label
        : null;

    if (appId || label) {
      return { appId, label };
    }
  }

  const description = proposal.description?.trim();
  if (!description) {
    return { appId: null, label: null };
  }

  const match = description.match(
    /^Register community app\s+(.+?)\s+\(([^)]+)\)\s+on\s+/m
  );

  if (!match) {
    return { appId: null, label: null };
  }

  return {
    label: match[1]?.trim() || null,
    appId: match[2]?.trim() || null,
  };
}

function mapPartnerProposalToFeedItem(
  proposal: GovernanceDaoProposalRecord,
  daoAccountId: string
): PublicGovernanceApplication | null {
  const partnerDetails = getPartnerProposalDetails(proposal);
  if (!partnerDetails) {
    return null;
  }

  const description = proposal.description?.trim() || null;

  return {
    app_id:
      partnerDetails.appId ?? `partner-proposal-${proposal.id ?? 'unknown'}`,
    label:
      partnerDetails.label ??
      description?.split('\n')[0]?.trim() ??
      'Partner proposal',
    status:
      proposal.status === 'Approved'
        ? 'approved'
        : proposal.status === 'Rejected' || proposal.status === 'Removed'
          ? 'rejected'
          : 'proposal_submitted',
    wallet_id: null,
    description,
    website_url: null,
    telegram_handle: null,
    x_handle: null,
    created_at: parseSubmissionTimeToIso(proposal.submission_time),
    governance_scope: 'partners',
    governance_proposal: buildGovernanceProposalFromRecord(
      proposal,
      daoAccountId,
      {
        description,
      }
    ),
  };
}

function classifyProtocolProposal(
  proposal: GovernanceDaoProposalRecord,
  daoAccountId: string
): {
  protocolKind: ProtocolGovernanceKind;
  targetAccount: string | null;
  targetMethod: string | null;
  subject: string;
} | null {
  const allowedReceivers = getAllowedProtocolReceivers();
  const kindName = getProposalKindName(proposal.kind);
  const kindPayload = proposal.kind?.[kindName];
  const { receiverId, methodName } = getFunctionCallShape(proposal.kind);

  if (getPartnerProposalDetails(proposal)) {
    return null;
  }

  if (kindName === 'SetStakingContract') {
    const stakingId = readKindStringField(kindPayload, 'staking_id');
    return {
      protocolKind: 'staking',
      targetAccount: stakingId,
      targetMethod: 'set_staking_contract',
      subject: 'Staking governance',
    };
  }

  if (kindName === 'Vote') {
    return {
      protocolKind: 'signaling',
      targetAccount: daoAccountId,
      targetMethod: 'vote',
      subject: 'Signal',
    };
  }

  if (kindName === 'FunctionCall') {
    if (isStakingProposal(proposal, kindName, receiverId, methodName)) {
      return {
        protocolKind: 'staking',
        targetAccount: receiverId,
        targetMethod: methodName,
        subject: getProtocolSubject(receiverId),
      };
    }

    if (!receiverId || !allowedReceivers.has(receiverId)) {
      return {
        protocolKind: 'config',
        targetAccount: receiverId,
        targetMethod: methodName,
        subject: receiverId ?? 'External contract',
      };
    }

    let protocolKind: ProtocolGovernanceKind = 'config';
    if (
      methodName === 'update_contract' ||
      methodName === 'update_contract_from_hash'
    ) {
      protocolKind = 'upgrade';
    } else if (methodName === 'set_owner') {
      protocolKind = 'permissions';
    }

    return {
      protocolKind,
      targetAccount: receiverId,
      targetMethod: methodName,
      subject: getProtocolSubject(receiverId),
    };
  }

  if (kindName === 'Transfer') {
    return {
      protocolKind: 'treasury',
      targetAccount: daoAccountId,
      targetMethod: 'transfer',
      subject:
        daoAccountId === config.treasuryDao
          ? 'Treasury custody'
          : 'Protocol treasury',
    };
  }

  if (
    kindName === 'ChangePolicy' ||
    kindName === 'AddMemberToRole' ||
    kindName === 'RemoveMemberFromRole' ||
    kindName.startsWith('ChangePolicy')
  ) {
    return {
      protocolKind: 'permissions',
      targetAccount: daoAccountId,
      targetMethod: kindName,
      subject:
        daoAccountId === config.treasuryDao ? 'Treasury DAO' : 'Governance DAO',
    };
  }

  if (kindName === 'ChangeConfig') {
    return {
      protocolKind: 'config',
      targetAccount: daoAccountId,
      targetMethod: kindName,
      subject:
        daoAccountId === config.treasuryDao ? 'Treasury DAO' : 'Governance DAO',
    };
  }

  if (kindName) {
    return {
      protocolKind: 'config',
      targetAccount: daoAccountId,
      targetMethod: kindName,
      subject: 'Governance proposal',
    };
  }

  return null;
}

function mapMissingProposalToFeedItem(
  daoAccountId: string,
  proposalId: number
): PublicGovernanceApplication {
  const description =
    'This proposal id was allocated on chain but is no longer stored by the DAO contract.';

  return {
    app_id: `protocol-proposal-${proposalId}`,
    label: `Proposal #${proposalId} (removed from chain)`,
    status: 'rejected',
    wallet_id: null,
    description,
    website_url: null,
    telegram_handle: null,
    x_handle: null,
    created_at: new Date(0).toISOString(),
    governance_scope: 'protocol',
    protocol_kind: 'config',
    protocol_subject: 'Governance proposal',
    protocol_target_account: daoAccountId,
    protocol_target_method: 'removed',
    governance_proposal: {
      proposal_id: proposalId,
      status: 'Removed',
      proposer: null,
      description,
      dao_account: daoAccountId,
      tx_hash: null,
      submitted_at: null,
      kind: { Removed: null },
      snapshot: {
        id: proposalId,
        proposer: '',
        description,
        kind: { Removed: null },
        status: 'Removed',
        vote_counts: {},
        votes: {},
        submission_time: '',
      },
    },
  };
}

function buildMissingProposalFeedItems(
  daoAccountId: string,
  snapshotsById: Map<number, GovernanceDaoProposalSnapshot>,
  lastProposalId: number
): PublicGovernanceApplication[] {
  const missing: PublicGovernanceApplication[] = [];
  let maxPersistedProposalId = -1;

  for (const proposalId of snapshotsById.keys()) {
    if (proposalId > maxPersistedProposalId) {
      maxPersistedProposalId = proposalId;
    }
  }

  // Fill internal holes only. get_last_proposal_id can run ahead of stored
  // proposals (e.g. failed create), so skip tail ids beyond what we have synced.
  const fillThroughId = Math.min(lastProposalId, maxPersistedProposalId);

  for (let proposalId = 0; proposalId <= fillThroughId; proposalId += 1) {
    if (snapshotsById.has(proposalId)) {
      continue;
    }

    missing.push(mapMissingProposalToFeedItem(daoAccountId, proposalId));
  }

  return missing;
}

function mapProtocolProposalToFeedItem(
  proposal: GovernanceDaoProposalRecord,
  daoAccountId: string
): PublicGovernanceApplication | null {
  const classified = classifyProtocolProposal(proposal, daoAccountId);
  if (!classified) {
    return null;
  }

  const description = proposal.description?.trim() || null;
  const label = deriveProtocolProposalHeadline(proposal);

  return {
    app_id: `protocol-proposal-${proposal.id ?? 'unknown'}`,
    label,
    status:
      proposal.status === 'Approved'
        ? 'approved'
        : proposal.status === 'Rejected' || proposal.status === 'Removed'
          ? 'rejected'
          : 'proposal_submitted',
    wallet_id: null,
    description,
    website_url: null,
    telegram_handle: null,
    x_handle: null,
    created_at: parseSubmissionTimeToIso(proposal.submission_time),
    governance_scope: 'protocol',
    protocol_kind: classified.protocolKind,
    protocol_subject: classified.subject,
    protocol_target_account: classified.targetAccount,
    protocol_target_method: classified.targetMethod,
    governance_proposal: buildGovernanceProposalFromRecord(
      proposal,
      daoAccountId,
      {
        description,
      }
    ),
  };
}

function toGovernanceDaoProposalRecord(
  snapshot: GovernanceDaoProposalSnapshot
): GovernanceDaoProposalRecord {
  return {
    id: snapshot.id,
    proposer: snapshot.proposer,
    description: snapshot.description,
    kind: snapshot.kind,
    status: snapshot.status,
    submission_time: snapshot.submission_time,
    vote_counts: snapshot.vote_counts,
    votes: snapshot.votes,
    last_actions_log: snapshot.last_actions_log,
  };
}

async function fetchDaoGovernanceFeed(daoAccountId: string): Promise<{
  partnerItems: PublicGovernanceApplication[];
  protocolItems: PublicGovernanceApplication[];
  daoPolicy: GovernanceDaoPolicySnapshot | null;
  snapshotsById: Map<number, GovernanceDaoProposalSnapshot>;
  scannedProposalIds: Set<number>;
}> {
  const empty = {
    partnerItems: [],
    protocolItems: [],
    daoPolicy: null,
    snapshotsById: new Map<number, GovernanceDaoProposalSnapshot>(),
    scannedProposalIds: new Set<number>(),
  };

  try {
    await ensureDaoProposalsSynced(daoAccountId);

    const [storedSnapshots, daoPolicy] = await Promise.all([
      loadAllDaoProposalSnapshots(daoAccountId),
      viewContractAt<GovernanceDaoPolicySnapshot>(
        daoAccountId,
        'get_policy',
        {}
      ).catch(() => null),
    ]);

    const snapshotsById = new Map<number, GovernanceDaoProposalSnapshot>();
    const proposals: GovernanceDaoProposalRecord[] = [];

    for (const stored of storedSnapshots) {
      const snapshot: GovernanceDaoProposalSnapshot = {
        id: stored.proposalId,
        proposer: stored.proposalSnapshot.proposer,
        description: stored.proposalSnapshot.description,
        kind: stored.proposalSnapshot.kind,
        status: stored.proposalSnapshot.status,
        vote_counts: stored.proposalSnapshot.vote_counts,
        votes: stored.proposalSnapshot.votes,
        submission_time: stored.proposalSnapshot.submission_time,
        resolved_at: stored.proposalSnapshot.resolved_at ?? stored.resolvedAt,
        last_actions_log: stored.proposalSnapshot.last_actions_log,
        policy_snapshot:
          stored.policySnapshot ??
          stored.proposalSnapshot.policy_snapshot ??
          null,
      };

      snapshotsById.set(snapshot.id, snapshot);
      proposals.push(toGovernanceDaoProposalRecord(snapshot));
    }

    const partnerItems = proposals
      .map((proposal) => mapPartnerProposalToFeedItem(proposal, daoAccountId))
      .filter((item): item is PublicGovernanceApplication => item !== null)
      .reverse();
    const protocolItemsMapped = proposals
      .map((proposal) => mapProtocolProposalToFeedItem(proposal, daoAccountId))
      .filter((item): item is PublicGovernanceApplication => item !== null);

    const lastProposalId = await viewContractAt<number>(
      daoAccountId,
      'get_last_proposal_id',
      {}
    ).catch(() => null);

    const gapItems =
      typeof lastProposalId === 'number' && lastProposalId >= 0
        ? buildMissingProposalFeedItems(
            daoAccountId,
            snapshotsById,
            lastProposalId
          )
        : [];

    const protocolItems = [...protocolItemsMapped, ...gapItems].reverse();

    const scannedProposalIds = new Set(
      proposals
        .map((proposal) => proposal.id)
        .filter(
          (proposalId): proposalId is number => typeof proposalId === 'number'
        )
    );

    if (typeof lastProposalId === 'number' && lastProposalId >= 0) {
      for (let proposalId = 0; proposalId <= lastProposalId; proposalId += 1) {
        scannedProposalIds.add(proposalId);
      }
    }

    return {
      partnerItems,
      protocolItems,
      daoPolicy,
      snapshotsById,
      scannedProposalIds,
    };
  } catch {
    return empty;
  }
}

function dedupePartnerItems(
  dbItems: PublicGovernanceApplication[],
  daoItems: PublicGovernanceApplication[],
  dbStatusOverrides?: Map<string, string>
) {
  const dbItemsByAppId = new Map(dbItems.map((item) => [item.app_id, item]));
  const existingProposalIds = new Set(
    dbItems
      .map((item) => item.governance_proposal?.proposal_id ?? null)
      .filter((proposalId): proposalId is number => proposalId !== null)
  );

  return daoItems.filter((item) => {
    const proposalId = item.governance_proposal?.proposal_id ?? null;

    // Already have this exact proposal from the DB — skip
    if (proposalId !== null && existingProposalIds.has(proposalId)) {
      return false;
    }

    const dbItem = dbItemsByAppId.get(item.app_id);
    if (dbItem) {
      // DB item already carries a governance proposal — skip the DAO-scanned duplicate
      if (dbItem.governance_proposal?.proposal_id != null) {
        return false;
      }
      // DB item has progressed past rejection — keep the DAO-scanned
      // historical entry but propagate reopened status so the frontend
      // hides the reopen button
      if (dbItem.status !== 'rejected') {
        item.status = 'reopened';
      }
      return true;
    }

    // No matching DB item in the feed query — check the status override
    // (covers apps that progressed to ready_for_governance / pending after
    // being reopened, which the feed SQL intentionally excludes)
    if (dbStatusOverrides) {
      const dbStatus = dbStatusOverrides.get(item.app_id);
      if (dbStatus && dbStatus !== 'rejected') {
        item.status = 'reopened';
      }
    }

    return true;
  });
}

function normalizeProposalId(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return null;
  }

  return numericValue;
}

async function fetchDaoProposalStatus(
  daoAccountId: string,
  proposalId: number
): Promise<string | null> {
  try {
    const proposal = await viewContractAt<{ status?: string }>(
      daoAccountId,
      'get_proposal',
      { id: proposalId }
    );

    return typeof proposal?.status === 'string' ? proposal.status : null;
  } catch {
    return null;
  }
}

export async function syncGovernanceProposalState<T extends GovernanceSyncRow>(
  row: T
): Promise<T> {
  if (row.status !== 'proposal_submitted') {
    return row;
  }

  const proposalId = normalizeProposalId(row.governance_proposal_id);
  const daoAccountId = row.governance_proposal_dao ?? config.governanceDao;

  if (proposalId !== null) {
    const liveProposalStatus = await fetchDaoProposalStatus(
      daoAccountId,
      proposalId
    );

    if (
      liveProposalStatus &&
      REJECTED_GOVERNANCE_STATUSES.has(liveProposalStatus)
    ) {
      const normalizedStatus = liveProposalStatus.toLowerCase();

      await query(
        `UPDATE partner_keys
         SET status = 'rejected',
             active = false,
             governance_proposal_status = $1
         WHERE app_id = $2`,
        [normalizedStatus, row.app_id]
      );

      return {
        ...row,
        status: 'rejected',
        governance_proposal_status: normalizedStatus,
      };
    }

    if (
      liveProposalStatus &&
      REOPENED_GOVERNANCE_STATUSES.has(liveProposalStatus)
    ) {
      const normalizedStatus = liveProposalStatus.toLowerCase();

      await query(
        `UPDATE partner_keys
         SET status = 'reopened',
             active = false,
             governance_proposal_status = $1
         WHERE app_id = $2`,
        [normalizedStatus, row.app_id]
      );

      return {
        ...row,
        status: 'reopened',
        governance_proposal_status: normalizedStatus,
      };
    }
  }

  const isRegistered = await isRewardsAppRegistered(row.app_id);
  if (!isRegistered) {
    return row;
  }

  const apiKey = row.api_key ?? generateApiKey();

  await query(
    `UPDATE partner_keys
     SET status = 'approved',
         api_key = $1,
         active = true,
         governance_proposal_status = 'executed'
     WHERE app_id = $2`,
    [apiKey, row.app_id]
  );

  return {
    ...row,
    status: 'approved',
    api_key: apiKey,
    governance_proposal_status: 'executed',
  };
}

export function parseGovernanceFeedScope(value: unknown): GovernanceFeedScope {
  if (value === 'partners' || value === 'protocol') {
    return value;
  }

  return 'all';
}

export async function getGovernanceFeedApplications(
  scope: GovernanceFeedScope = 'all',
  daoAccountId: string = config.governanceDao
): Promise<{
  applications: PublicGovernanceApplication[];
  daoPolicy: GovernanceDaoPolicySnapshot | null;
}> {
  const isTreasuryBoard = daoAccountId === config.treasuryDao;
  const includePartners =
    !isTreasuryBoard && (scope === 'all' || scope === 'partners');
  const includeProtocol = scope === 'all' || scope === 'protocol';

  const partnerItems = includePartners
    ? await (async () => {
        const result = await query(
          `SELECT app_id,
                  label,
                  status,
                  wallet_id,
                  description,
                  website_url,
                  telegram_handle,
                  x_handle,
                  created_at,
                  governance_proposal_id,
                  governance_proposal_status,
                  governance_proposal_description,
                  governance_proposal_dao,
                  governance_proposal_payload,
                  governance_proposal_tx_hash,
                  governance_proposal_submitted_at
           FROM partner_keys
          WHERE status IN ('proposal_submitted', 'approved', 'reopened')
            OR (status = 'rejected' AND governance_proposal_status IS NOT NULL)
           ORDER BY created_at DESC`
        );

        const syncedRows = await Promise.all(
          result.rows.map((row) =>
            syncGovernanceProposalState(row as GovernanceSyncRow)
          )
        );

        return syncedRows.map((row) => mapPublicApplication(row));
      })()
    : [];

  const daoFeed =
    includePartners || includeProtocol
      ? await fetchDaoGovernanceFeed(daoAccountId)
      : {
          partnerItems: [],
          protocolItems: [],
          daoPolicy: null,
          snapshotsById: new Map<number, GovernanceDaoProposalSnapshot>(),
          scannedProposalIds: new Set<number>(),
        };

  // For DAO-scanned partner items that don't appear in the feed SQL
  // (e.g. app was reopened → partner reapplied → status is now
  // 'ready_for_governance'), look up their actual DB status so the dedup
  // can suppress the reopen button on stale rejected DAO proposals.
  let dbStatusOverrides: Map<string, string> | undefined;
  if (includePartners && daoFeed.partnerItems.length > 0) {
    const partnerAppIdSet = new Set(partnerItems.map((item) => item.app_id));
    const unmatchedDaoAppIds = daoFeed.partnerItems
      .map((item) => item.app_id)
      .filter((id) => !partnerAppIdSet.has(id));

    if (unmatchedDaoAppIds.length > 0) {
      const statusResult = await query(
        `SELECT app_id, status FROM partner_keys WHERE app_id = ANY($1::text[])`,
        [unmatchedDaoAppIds]
      );
      dbStatusOverrides = new Map(
        statusResult.rows.map((r) => [String(r.app_id), String(r.status)])
      );
    }
  }

  const scannedPartnerItems = includePartners
    ? dedupePartnerItems(partnerItems, daoFeed.partnerItems, dbStatusOverrides)
    : [];
  const protocolItems = includeProtocol ? daoFeed.protocolItems : [];

  const applications = await hydrateDbOnlyPersistedPolicySnapshots(
    [...partnerItems, ...scannedPartnerItems, ...protocolItems].map((app) =>
      enrichApplicationProposalSnapshot(app, daoFeed.snapshotsById)
    ),
    daoAccountId,
    daoFeed.scannedProposalIds
  );

  return {
    applications,
    daoPolicy: daoFeed.daoPolicy,
  };
}
