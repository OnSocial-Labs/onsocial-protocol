import {
  BOOST_CONTRACT,
  CORE_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  STAKING_CONTRACT,
  TOKEN_CONTRACT,
} from '@/lib/near-rpc';
import { GOVERNANCE_DAO_ACCOUNT } from '@/lib/portal-config';
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

function classifyProtocolProposal(proposal: GovernanceDaoProposal): {
  protocolKind: ProtocolGovernanceKind;
  targetAccount: string | null;
  targetMethod: string | null;
  subject: string;
} | null {
  if (getPartnerProposalDetails(proposal)) {
    return null;
  }

  const kindName = getProposalKindName(proposal.kind);
  const { receiverId, methodName } = getFunctionCallShape(proposal.kind);

  if (
    kindName === 'SetStakingContract' ||
    STAKING_GOVERNANCE_ACCOUNTS.has(receiverId ?? '') ||
    containsStakingKeyword(methodName) ||
    containsStakingKeyword(proposal.description)
  ) {
    return null;
  }

  if (kindName === 'FunctionCall') {
    if (!receiverId || !ALLOWED_PROTOCOL_RECEIVERS.has(receiverId)) {
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
      subject: receiverId,
    };
  }

  if (kindName === 'Transfer') {
    return {
      protocolKind: 'treasury',
      targetAccount: GOVERNANCE_DAO_ACCOUNT,
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
      targetAccount: GOVERNANCE_DAO_ACCOUNT,
      targetMethod: kindName,
      subject: 'Governance DAO',
    };
  }

  if (kindName === 'ChangeConfig') {
    return {
      protocolKind: 'config',
      targetAccount: GOVERNANCE_DAO_ACCOUNT,
      targetMethod: kindName,
      subject: 'Governance DAO',
    };
  }

  return null;
}

export function shouldIncludeInGovernanceBootstrap(
  proposal: GovernanceDaoProposal
): boolean {
  return (
    getPartnerProposalDetails(proposal) !== null ||
    classifyProtocolProposal(proposal) !== null
  );
}

export function resolveGovernanceBootstrapAppId(
  proposal: GovernanceDaoProposal,
  proposalId: number
): string {
  const partnerDetails = getPartnerProposalDetails(proposal);
  if (partnerDetails?.appId) {
    return partnerDetails.appId;
  }

  if (classifyProtocolProposal(proposal)) {
    return `protocol-proposal-${proposalId}`;
  }

  return `partner-proposal-${proposalId}`;
}

function resolveBootstrapScope(
  proposal: GovernanceDaoProposal,
  appId: string
): GovernanceScope {
  if (
    classifyProtocolProposal(proposal) ||
    appId.startsWith('protocol-proposal-')
  ) {
    return 'protocol';
  }

  return 'partners';
}

export function buildGovernanceApplicationsFromDaoProposals(
  proposals: GovernanceDaoProposal[]
): Application[] {
  const apps: Application[] = [];

  for (const proposal of proposals) {
    const proposalId = proposal.id;
    if (proposalId == null || proposalId < 0) continue;
    if (!shouldIncludeInGovernanceBootstrap(proposal)) continue;

    const partnerDetails = getPartnerProposalDetails(proposal);
    const protocolDetails = classifyProtocolProposal(proposal);
    const appId = resolveGovernanceBootstrapAppId(proposal, proposalId);
    const scope = resolveBootstrapScope(proposal, appId);
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
      }
    );

    apps.push(app);
  }

  return apps;
}
