import { randomBytes } from 'crypto';
import { query } from '../db/index.js';
import { config } from '../config/index.js';
import { viewContractAt } from './near.js';
import {
  isRewardsAppRegistered,
  type GovernanceProposalPayload,
} from './governance-proposals.js';

const PROTOCOL_PROPOSAL_SCAN_LIMIT = 100;
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
};

type ProtocolGovernanceKind = 'upgrade' | 'treasury' | 'permissions' | 'config';

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
  proposal: GovernanceDaoProposalRecord
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
    governance_proposal: {
      proposal_id: proposal.id ?? null,
      status: proposal.status ?? 'Unknown',
      proposer: proposal.proposer ?? null,
      description,
      dao_account: config.governanceDao,
      tx_hash: null,
      submitted_at: proposal.submission_time ?? null,
    },
  };
}

function classifyProtocolProposal(proposal: GovernanceDaoProposalRecord): {
  protocolKind: ProtocolGovernanceKind;
  targetAccount: string | null;
  targetMethod: string | null;
  subject: string;
} | null {
  const allowedReceivers = getAllowedProtocolReceivers();
  const excludedReceivers = getExcludedProtocolReceivers();
  const kindName = getProposalKindName(proposal.kind);
  const { receiverId, methodName } = getFunctionCallShape(proposal.kind);

  if (getPartnerProposalDetails(proposal)) {
    return null;
  }

  if (
    kindName === 'SetStakingContract' ||
    excludedReceivers.has(receiverId ?? '') ||
    containsStakingKeyword(methodName) ||
    containsStakingKeyword(proposal.description)
  ) {
    return null;
  }

  if (kindName === 'FunctionCall') {
    if (!receiverId || !allowedReceivers.has(receiverId)) {
      return null;
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
      targetAccount: config.governanceDao,
      targetMethod: 'transfer',
      subject: 'Protocol treasury',
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
      targetAccount: config.governanceDao,
      targetMethod: kindName,
      subject: 'Governance DAO',
    };
  }

  if (kindName === 'ChangeConfig') {
    return {
      protocolKind: 'config',
      targetAccount: config.governanceDao,
      targetMethod: kindName,
      subject: 'Governance DAO',
    };
  }

  return null;
}

function mapProtocolProposalToFeedItem(
  proposal: GovernanceDaoProposalRecord
): PublicGovernanceApplication | null {
  const classified = classifyProtocolProposal(proposal);
  if (!classified) {
    return null;
  }

  const description = proposal.description?.trim() || null;
  const label =
    description?.split('\n')[0]?.trim() || `${classified.subject} proposal`;

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
    governance_proposal: {
      proposal_id: proposal.id ?? null,
      status: proposal.status ?? 'Unknown',
      proposer: proposal.proposer ?? null,
      description,
      dao_account: config.governanceDao,
      tx_hash: null,
      submitted_at: proposal.submission_time ?? null,
    },
  };
}

async function fetchDaoGovernanceFeed(): Promise<{
  partnerItems: PublicGovernanceApplication[];
  protocolItems: PublicGovernanceApplication[];
}> {
  try {
    const lastProposalId = await viewContractAt<number>(
      config.governanceDao,
      'get_last_proposal_id',
      {}
    );

    if (typeof lastProposalId !== 'number' || lastProposalId < 0) {
      return { partnerItems: [], protocolItems: [] };
    }

    const limit = Math.min(lastProposalId + 1, PROTOCOL_PROPOSAL_SCAN_LIMIT);
    const fromIndex = Math.max(0, lastProposalId + 1 - limit);
    const proposals = await viewContractAt<GovernanceDaoProposalRecord[]>(
      config.governanceDao,
      'get_proposals',
      { from_index: fromIndex, limit }
    );

    if (!Array.isArray(proposals)) {
      return { partnerItems: [], protocolItems: [] };
    }

    const partnerItems = proposals
      .map(mapPartnerProposalToFeedItem)
      .filter((item): item is PublicGovernanceApplication => item !== null)
      .reverse();
    const protocolItems = proposals
      .map(mapProtocolProposalToFeedItem)
      .filter((item): item is PublicGovernanceApplication => item !== null)
      .reverse();

    return { partnerItems, protocolItems };
  } catch {
    return { partnerItems: [], protocolItems: [] };
  }
}

function dedupePartnerItems(
  dbItems: PublicGovernanceApplication[],
  daoItems: PublicGovernanceApplication[]
) {
  const existingAppIds = new Set(dbItems.map((item) => item.app_id));
  const existingProposalIds = new Set(
    dbItems
      .map((item) => item.governance_proposal?.proposal_id ?? null)
      .filter((proposalId): proposalId is number => proposalId !== null)
  );

  return daoItems.filter((item) => {
    const proposalId = item.governance_proposal?.proposal_id ?? null;
    if (existingAppIds.has(item.app_id)) {
      return false;
    }

    if (proposalId !== null && existingProposalIds.has(proposalId)) {
      return false;
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
  scope: GovernanceFeedScope = 'all'
) {
  const includePartners = scope === 'all' || scope === 'partners';
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
          WHERE status IN ('ready_for_governance', 'proposal_submitted', 'approved', 'rejected')
            OR (status = 'reopened' AND governance_proposal_status IS NOT NULL)
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
      ? await fetchDaoGovernanceFeed()
      : { partnerItems: [], protocolItems: [] };

  const scannedPartnerItems = includePartners
    ? dedupePartnerItems(partnerItems, daoFeed.partnerItems)
    : [];
  const protocolItems = includeProtocol ? daoFeed.protocolItems : [];

  return [...partnerItems, ...scannedPartnerItems, ...protocolItems];
}
