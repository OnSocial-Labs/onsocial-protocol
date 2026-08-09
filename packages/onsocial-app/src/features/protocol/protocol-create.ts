import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_PROPOSAL_BOND,
} from '@/lib/app-config';
import { extractNearTransactionHashes, yoctoToNear } from '@/lib/app-near-rpc';
import { getProtocolProposalBond } from '@/features/protocol/protocol-eligibility';
import type { ProtocolDaoPolicy, ProtocolDaoRole } from '@/features/protocol/types';

const ADD_PROPOSAL_GAS = '300000000000000';

export type ProtocolCreateKind =
  | 'signal'
  | 'join_self'
  | 'add_member'
  | 'leave_self'
  | 'remove_member'
  | 'transfer';

export const PROTOCOL_CREATE_KIND_OPTIONS: Array<{
  id: ProtocolCreateKind;
  label: string;
  group: 'signaling' | 'membership' | 'treasury';
}> = [
  { id: 'signal', label: 'Signal', group: 'signaling' },
  { id: 'join_self', label: 'Join role', group: 'membership' },
  { id: 'add_member', label: 'Add member', group: 'membership' },
  { id: 'leave_self', label: 'Leave role', group: 'membership' },
  { id: 'remove_member', label: 'Remove member', group: 'membership' },
  { id: 'transfer', label: 'Transfer', group: 'treasury' },
];

export interface ProtocolProposalPayload {
  proposal: {
    description: string;
    kind: Record<string, unknown>;
  };
}

export function getCreatableProtocolRoleOptions(
  policy: ProtocolDaoPolicy | null | undefined
): string[] {
  const names =
    policy?.roles
      ?.filter((role) => Array.isArray(role.kind?.Group))
      .map((role) => role.name?.trim())
      .filter((name): name is string => Boolean(name))
      .filter((name) => name !== 'delegated_proposers') ?? [];
  return [...new Set(names)].sort((left, right) => left.localeCompare(right));
}

export function buildProtocolSignalProposalPayload(
  description: string
): ProtocolProposalPayload {
  const proposalDescription = description.trim();
  if (!proposalDescription) {
    throw new Error('Signal description is required.');
  }
  return {
    proposal: {
      description: proposalDescription,
      kind: { Vote: null },
    },
  };
}

export function buildProtocolMemberProposalPayload(opts: {
  add: boolean;
  memberId: string;
  roleId: string;
  description?: string;
}): ProtocolProposalPayload {
  const memberId = opts.memberId.trim();
  const roleId = opts.roleId.trim();
  if (!memberId) throw new Error('Member account is required.');
  if (!roleId) throw new Error('Role is required.');
  const description =
    opts.description?.trim() ||
    (opts.add
      ? `Add ${memberId} to the ${roleId} role.`
      : `Remove ${memberId} from the ${roleId} role.`);
  return {
    proposal: {
      description,
      kind: opts.add
        ? { AddMemberToRole: { member_id: memberId, role: roleId } }
        : { RemoveMemberFromRole: { member_id: memberId, role: roleId } },
    },
  };
}

export function buildProtocolTransferProposalPayload(opts: {
  receiverId: string;
  amountYocto: string;
  tokenId?: string;
  description?: string;
}): ProtocolProposalPayload {
  const receiverId = opts.receiverId.trim();
  const amountYocto = opts.amountYocto.trim();
  if (!receiverId) throw new Error('Recipient account is required.');
  if (!/^\d+$/.test(amountYocto) || amountYocto === '0') {
    throw new Error('Enter a valid transfer amount.');
  }
  const tokenId = opts.tokenId?.trim() ?? '';
  const assetLabel = tokenId
    ? `${amountYocto} (${tokenId})`
    : `${yoctoToNear(amountYocto)} NEAR`;
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Transfer ${assetLabel} from the DAO to ${receiverId}.`,
      kind: {
        Transfer: {
          token_id: tokenId,
          receiver_id: receiverId,
          amount: amountYocto,
        },
      },
    },
  };
}

export function buildProtocolCreatePayload(opts: {
  kind: ProtocolCreateKind;
  accountId: string | null;
  description: string;
  roleId?: string;
  memberId?: string;
  receiverId?: string;
  amountYocto?: string;
}): ProtocolProposalPayload {
  switch (opts.kind) {
    case 'signal':
      return buildProtocolSignalProposalPayload(opts.description);
    case 'join_self':
      return buildProtocolMemberProposalPayload({
        add: true,
        memberId: opts.accountId ?? '',
        roleId: opts.roleId ?? '',
        description: opts.description,
      });
    case 'add_member':
      return buildProtocolMemberProposalPayload({
        add: true,
        memberId: opts.memberId ?? '',
        roleId: opts.roleId ?? '',
        description: opts.description,
      });
    case 'leave_self':
      return buildProtocolMemberProposalPayload({
        add: false,
        memberId: opts.accountId ?? '',
        roleId: opts.roleId ?? '',
        description: opts.description,
      });
    case 'remove_member':
      return buildProtocolMemberProposalPayload({
        add: false,
        memberId: opts.memberId ?? '',
        roleId: opts.roleId ?? '',
        description: opts.description,
      });
    case 'transfer':
      return buildProtocolTransferProposalPayload({
        receiverId: opts.receiverId ?? '',
        amountYocto: opts.amountYocto ?? '',
        description: opts.description,
      });
    default: {
      const exhaustive: never = opts.kind;
      throw new Error(`Unsupported proposal kind: ${exhaustive}`);
    }
  }
}

function decodeProposalId(result: unknown): number | null {
  const successValue = (result as { status?: { SuccessValue?: string } })
    ?.status?.SuccessValue;
  if (typeof successValue !== 'string') return null;
  const decoded = atob(successValue).trim().replace(/^"|"$/g, '');
  return /^\d+$/.test(decoded) ? Number(decoded) : null;
}

export async function submitProtocolProposal(opts: {
  wallet: NearWalletBase;
  accountId: string;
  daoAccountId: string;
  payload: ProtocolProposalPayload;
}): Promise<{ proposalId: number | null; txHashes: string[] }> {
  const proposalBond =
    (await getProtocolProposalBond(opts.daoAccountId).catch(() => null)) ??
    GOVERNANCE_PROPOSAL_BOND;

  const result = await opts.wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId: opts.accountId,
    receiverId: opts.daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: opts.payload,
          gas: ADD_PROPOSAL_GAS,
          deposit: proposalBond,
        },
      },
    ],
  });

  return {
    proposalId: decodeProposalId(result),
    txHashes: extractNearTransactionHashes(result),
  };
}

/** @deprecated Prefer submitProtocolProposal */
export async function submitProtocolSignalProposal(opts: {
  wallet: NearWalletBase;
  accountId: string;
  daoAccountId: string;
  description: string;
}): Promise<{ proposalId: number | null; txHashes: string[] }> {
  return submitProtocolProposal({
    ...opts,
    payload: buildProtocolSignalProposalPayload(opts.description),
  });
}

export function findProtocolRole(
  policy: ProtocolDaoPolicy | null | undefined,
  roleId: string
): ProtocolDaoRole | null {
  const normalized = roleId.trim().toLowerCase();
  if (!normalized) return null;
  return (
    policy?.roles?.find(
      (role) => role.name?.trim().toLowerCase() === normalized
    ) ?? null
  );
}
