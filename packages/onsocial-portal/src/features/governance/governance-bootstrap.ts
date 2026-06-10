import {
  BOOST_CONTRACT,
  CORE_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  STAKING_CONTRACT,
  TOKEN_CONTRACT,
} from '@/lib/near-rpc';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/portal-config';
import { buildGovernanceApplicationFromDaoProposal } from '@/features/governance/page-utils';
import type {
  Application,
  GovernanceDaoProposal,
  GovernanceScope,
  ProtocolGovernanceKind,
} from '@/features/governance/types';

const STAKING_GOVERNANCE_ACCOUNTS = new Set([
  STAKING_CONTRACT,
  'staking-governance.onsocial.near',
  'staking-governance.onsocial.testnet',
]);

const ALLOWED_PROTOCOL_RECEIVERS = new Set([
  REWARDS_CONTRACT,
  BOOST_CONTRACT,
  CORE_CONTRACT,
  SCARCES_CONTRACT,
  TOKEN_CONTRACT,
  GOVERNANCE_DAO_ACCOUNT,
]);

function getProposalKindName(kind: Record<string, unknown>): string {
  const key = Object.keys(kind)[0];
  return key ?? '';
}

function getFunctionCallShape(kind: Record<string, unknown>): {
  receiverId: string | null;
  methodName: string | null;
  args: Record<string, unknown> | null;
} {
  const payload = kind.FunctionCall;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { receiverId: null, methodName: null, args: null };
  }

  const receiverId =
    'receiver_id' in payload && typeof payload.receiver_id === 'string'
      ? payload.receiver_id
      : null;
  const methodName =
    'method_name' in payload && typeof payload.method_name === 'string'
      ? payload.method_name
      : null;
  const args =
    'args' in payload &&
    payload.args &&
    typeof payload.args === 'object' &&
    !Array.isArray(payload.args)
      ? (payload.args as Record<string, unknown>)
      : null;

  return { receiverId, methodName, args };
}

function containsStakingKeyword(value: string | null | undefined): boolean {
  if (!value) return false;
  return /staking/i.test(value);
}

function readKindStringField(
  kindPayload: unknown,
  field: string
): string | null {
  if (
    !kindPayload ||
    typeof kindPayload !== 'object' ||
    Array.isArray(kindPayload)
  ) {
    return null;
  }

  const raw = (kindPayload as Record<string, unknown>)[field];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function isStakingProposal(
  proposal: GovernanceDaoProposal,
  receiverId: string | null,
  methodName: string | null
): boolean {
  const kindName = getProposalKindName(proposal.kind);
  return (
    kindName === 'SetStakingContract' ||
    STAKING_GOVERNANCE_ACCOUNTS.has(receiverId ?? '') ||
    containsStakingKeyword(methodName) ||
    containsStakingKeyword(proposal.description)
  );
}

export function getPartnerProposalDetails(proposal: GovernanceDaoProposal): {
  appId: string | null;
  label: string | null;
} | null {
  const { receiverId, methodName, args } = getFunctionCallShape(proposal.kind);

  if (receiverId !== REWARDS_CONTRACT || methodName !== 'register_app') {
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
    return null;
  }

  const match = description.match(
    /^Register community app\s+(.+?)\s+\(([^)]+)\)\s+on\s+/m
  );

  if (!match) {
    return null;
  }

  return {
    label: match[1]?.trim() || null,
    appId: match[2]?.trim() || null,
  };
}

function classifyProtocolProposal(
  proposal: GovernanceDaoProposal,
  daoAccountId: string
): {
  protocolKind: ProtocolGovernanceKind;
  targetAccount: string | null;
  targetMethod: string | null;
  subject: string;
} | null {
  if (getPartnerProposalDetails(proposal)) {
    return null;
  }

  const kindName = getProposalKindName(proposal.kind);
  const kindPayload = proposal.kind?.[kindName];
  const { receiverId, methodName } = getFunctionCallShape(proposal.kind);

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
      subject: 'Signaling',
    };
  }

  if (kindName === 'FunctionCall') {
    if (isStakingProposal(proposal, receiverId, methodName)) {
      return {
        protocolKind: 'staking',
        targetAccount: receiverId,
        targetMethod: methodName,
        subject: receiverId ?? 'Staking governance',
      };
    }

    if (!receiverId || !ALLOWED_PROTOCOL_RECEIVERS.has(receiverId)) {
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
      subject: receiverId,
    };
  }

  if (kindName === 'Transfer') {
    return {
      protocolKind: 'treasury',
      targetAccount: daoAccountId,
      targetMethod: 'transfer',
      subject:
        daoAccountId === TREASURY_DAO_ACCOUNT
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
        daoAccountId === TREASURY_DAO_ACCOUNT
          ? 'Treasury DAO'
          : 'Governance DAO',
    };
  }

  if (kindName === 'ChangeConfig') {
    return {
      protocolKind: 'config',
      targetAccount: daoAccountId,
      targetMethod: kindName,
      subject:
        daoAccountId === TREASURY_DAO_ACCOUNT
          ? 'Treasury DAO'
          : 'Governance DAO',
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

export function buildMissingGovernanceApplicationFromProposalId(
  proposalId: number,
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): Application {
  const appId = `protocol-proposal-${proposalId}`;
  const description =
    'This proposal id was allocated on chain but is no longer stored by the DAO contract.';

  return buildGovernanceApplicationFromDaoProposal(
    appId,
    {
      id: proposalId,
      proposer: '',
      description,
      kind: { Removed: null },
      status: 'Removed',
      vote_counts: {},
      votes: {},
      submission_time: '',
    },
    proposalId,
    {
      scope: 'protocol',
      label: `Proposal #${proposalId} (removed from chain)`,
      protocolKind: 'config',
      protocolSubject: 'Governance proposal',
      protocolTargetAccount: daoAccountId,
      protocolTargetMethod: 'removed',
      daoAccountId,
    }
  );
}

export function shouldIncludeInGovernanceBootstrap(
  proposal: GovernanceDaoProposal,
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): boolean {
  return (
    getPartnerProposalDetails(proposal) !== null ||
    classifyProtocolProposal(proposal, daoAccountId) !== null
  );
}

export function resolveGovernanceBootstrapAppId(
  proposal: GovernanceDaoProposal,
  proposalId: number,
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT
): string {
  const partnerDetails = getPartnerProposalDetails(proposal);
  if (partnerDetails?.appId) {
    return partnerDetails.appId;
  }

  if (classifyProtocolProposal(proposal, daoAccountId)) {
    return `protocol-proposal-${proposalId}`;
  }

  return `partner-proposal-${proposalId}`;
}

function resolveBootstrapScope(
  proposal: GovernanceDaoProposal,
  appId: string,
  daoAccountId: string
): GovernanceScope {
  if (
    classifyProtocolProposal(proposal, daoAccountId) ||
    appId.startsWith('protocol-proposal-')
  ) {
    return 'protocol';
  }

  return 'partners';
}

export function buildGovernanceApplicationsFromDaoProposals(
  proposals: GovernanceDaoProposal[],
  daoAccountId: string = GOVERNANCE_DAO_ACCOUNT,
  options?: { lastProposalId?: number | null }
): Application[] {
  const apps: Application[] = [];
  const seenProposalIds = new Set<number>();

  for (const proposal of proposals) {
    const proposalId = proposal.id;
    if (proposalId == null || proposalId < 0) continue;
    if (!shouldIncludeInGovernanceBootstrap(proposal, daoAccountId)) continue;

    const partnerDetails = getPartnerProposalDetails(proposal);
    const protocolDetails = classifyProtocolProposal(proposal, daoAccountId);
    const appId = resolveGovernanceBootstrapAppId(
      proposal,
      proposalId,
      daoAccountId
    );
    const scope = resolveBootstrapScope(proposal, appId, daoAccountId);
    const description = proposal.description?.trim() || null;
    const label =
      partnerDetails?.label ??
      description?.split('\n')[0]?.trim() ??
      (scope === 'protocol' ? 'Protocol proposal' : 'Partner proposal');

    const app = buildGovernanceApplicationFromDaoProposal(
      appId,
      proposal,
      proposalId,
      {
        scope,
        label,
        protocolKind: protocolDetails?.protocolKind ?? null,
        protocolSubject: protocolDetails?.subject ?? null,
        protocolTargetAccount: protocolDetails?.targetAccount ?? null,
        protocolTargetMethod: protocolDetails?.targetMethod ?? null,
        daoAccountId,
      }
    );

    apps.push(app);
    seenProposalIds.add(proposalId);
  }

  const lastProposalId = options?.lastProposalId;
  if (typeof lastProposalId === 'number' && lastProposalId >= 0) {
    const maxPersistedProposalId =
      seenProposalIds.size > 0 ? Math.max(...seenProposalIds) : -1;
    const fillThroughId = Math.min(lastProposalId, maxPersistedProposalId);

    for (let proposalId = 0; proposalId <= fillThroughId; proposalId += 1) {
      if (seenProposalIds.has(proposalId)) {
        continue;
      }

      apps.push(
        buildMissingGovernanceApplicationFromProposalId(
          proposalId,
          daoAccountId
        )
      );
    }
  }

  return apps;
}
