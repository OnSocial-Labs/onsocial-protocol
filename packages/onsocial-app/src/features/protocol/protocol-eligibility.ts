import {
  GOVERNANCE_DAO_ACCOUNT,
  SOCIAL_TOKEN_CONTRACT,
} from '@/lib/app-config';
import {
  getSpendableNearBalance,
  normalizeFtBalanceYocto,
  viewAccount,
  viewNearContract,
} from '@/lib/app-near-rpc';
import { isProtocolDaoGroupMember } from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

const DEFAULT_PROPOSER_THRESHOLD = '100000000000000000000';
const NEAR_STORAGE_BYTE_COST = 10_000_000_000_000_000_000n;
const DELEGATION_STORAGE_BYTES_OVERHEAD = 16n;
const REGISTRATION_DEPOSIT_FLOOR = '50000000000000000000000';

export interface ProtocolGovernanceEligibility {
  daoAccountId: string;
  stakingContractId: string | null;
  requiredWeight: string;
  delegatedWeight: string;
  remainingToThreshold: string;
  walletBalance: string;
  nearBalance: string;
  voteAmount: string;
  availableToDelegate: string;
  selfDelegatedWeight: string;
  selfDelegationEntries: string[];
  isRegistered: boolean;
  registrationStorageDeposit: string;
  delegateActionNearStorageNeeded: string;
  depositNeeded: string;
  delegateNeeded: string;
  isInCooldown: boolean;
  availableToWithdraw: string;
  /** Member-role stake threshold met (weight only). */
  canPropose: boolean;
  /** Viewer is listed on a Group role (council path without stake). */
  isGroupMember: boolean;
  proposalBond: string;
}

/**
 * Effective propose right — Group council OR Member stake threshold.
 * Use for Manage / mood / Boost / claim / As-DAO entry; keep `canPropose`
 * for stake-sheet weight copy.
 */
export function viewerCanProposeOnDao(
  eligibility:
    | Pick<ProtocolGovernanceEligibility, 'canPropose' | 'isGroupMember'>
    | null
    | undefined
): boolean {
  return Boolean(
    eligibility && (eligibility.isGroupMember || eligibility.canPropose)
  );
}

interface StakingUser {
  storage_used: number;
  near_amount: string;
  vote_amount: string;
  next_action_timestamp: string | number;
  delegated_amounts: Array<[string, string]>;
}

function maxYocto(value: bigint): string {
  return (value > 0n ? value : 0n).toString();
}

function sumYocto(values: string[]): string {
  return values
    .reduce((total, value) => total + BigInt(value || '0'), 0n)
    .toString();
}

async function tryViewNearContract<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {}
): Promise<T | null> {
  try {
    return await viewNearContract<T>(contractId, methodName, args);
  } catch {
    return null;
  }
}

function getDelegationStorageCost(accountId: string): string {
  const bytes = BigInt(accountId.length) + DELEGATION_STORAGE_BYTES_OVERHEAD;
  return (bytes * NEAR_STORAGE_BYTE_COST).toString();
}

function getProposerThreshold(policy: ProtocolDaoPolicy | null): string {
  const roles = policy?.roles ?? [];
  const proposerRole =
    roles.find((role) => role.name === 'delegated_proposers') ??
    roles.find(
      (role) =>
        role.kind?.Member != null &&
        role.kind.Member !== '' &&
        (role.permissions ?? []).includes('call:AddProposal')
    );
  return proposerRole?.kind?.Member ?? DEFAULT_PROPOSER_THRESHOLD;
}

export async function getProtocolProposalBond(
  daoAccountId: string
): Promise<string> {
  const policy = await tryViewNearContract<ProtocolDaoPolicy>(
    daoAccountId,
    'get_policy'
  );
  return policy?.proposal_bond ?? '0';
}

export async function getProtocolDaoConfig(
  daoAccountId: string
): Promise<{ name: string; purpose: string; metadata: string } | null> {
  return tryViewNearContract<{
    name: string;
    purpose: string;
    metadata: string;
  }>(daoAccountId, 'get_config');
}

export async function getProtocolGovernanceEligibility(
  accountId: string,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT
): Promise<ProtocolGovernanceEligibility> {
  const [
    policy,
    stakingContractRaw,
    delegatedWeightRaw,
    walletBalanceRaw,
    nearAccount,
  ] = await Promise.all([
    tryViewNearContract<ProtocolDaoPolicy>(daoAccountId, 'get_policy'),
    tryViewNearContract<string>(daoAccountId, 'get_staking_contract'),
    tryViewNearContract<string>(daoAccountId, 'delegation_balance_of', {
      account_id: accountId,
    }),
    tryViewNearContract<unknown>(SOCIAL_TOKEN_CONTRACT, 'ft_balance_of', {
      account_id: accountId,
    }),
    viewAccount(accountId),
  ]);

  const requiredWeight = getProposerThreshold(policy);
  const delegatedWeight = String(delegatedWeightRaw ?? '0');
  const walletBalance = normalizeFtBalanceYocto(walletBalanceRaw).toString();
  const nearBalance = getSpendableNearBalance(nearAccount);
  const proposalBond = policy?.proposal_bond ?? '0';
  const stakingContractId = stakingContractRaw?.trim() || null;
  const remainingToThreshold = maxYocto(
    BigInt(requiredWeight) - BigInt(delegatedWeight)
  );
  const isGroupMember = isProtocolDaoGroupMember(policy, accountId);
  const canProposeByWeight =
    BigInt(delegatedWeight) >= BigInt(requiredWeight);

  if (!stakingContractId) {
    return {
      daoAccountId,
      stakingContractId: null,
      requiredWeight,
      delegatedWeight,
      remainingToThreshold,
      walletBalance,
      nearBalance,
      voteAmount: '0',
      availableToDelegate: '0',
      selfDelegatedWeight: '0',
      selfDelegationEntries: [],
      isRegistered: false,
      registrationStorageDeposit: '0',
      delegateActionNearStorageNeeded: '0',
      depositNeeded: remainingToThreshold,
      delegateNeeded: '0',
      isInCooldown: false,
      availableToWithdraw: '0',
      canPropose: canProposeByWeight,
      isGroupMember,
      proposalBond,
    };
  }

  const [storageBalance, storageBounds, user] = await Promise.all([
    tryViewNearContract<{ total: string; available: string }>(
      stakingContractId,
      'storage_balance_of',
      { account_id: accountId }
    ),
    tryViewNearContract<{ min: string }>(
      stakingContractId,
      'storage_balance_bounds'
    ),
    tryViewNearContract<StakingUser>(stakingContractId, 'get_user', {
      account_id: accountId,
    }),
  ]);

  const isRegistered = Boolean(storageBalance);
  const contractMin = BigInt(storageBounds?.min ?? '0');
  const floor = BigInt(REGISTRATION_DEPOSIT_FLOOR);
  const registrationStorageDeposit = (
    contractMin > floor ? contractMin : floor
  ).toString();

  const storageAvailable = (() => {
    if (!isRegistered || !user) return '0';
    const storageCovered = BigInt(user.storage_used) * NEAR_STORAGE_BYTE_COST;
    return maxYocto(BigInt(user.near_amount ?? '0') - storageCovered);
  })();

  const voteAmount = user?.vote_amount ?? '0';
  const delegatedAmounts = user?.delegated_amounts ?? [];
  const totalDelegatedFromStaking = sumYocto(
    delegatedAmounts.map(([, amount]) => amount)
  );
  const selfDelegationEntries = delegatedAmounts
    .filter(([delegateId]) => delegateId === accountId)
    .map(([, amount]) => amount);
  const selfDelegatedWeight = sumYocto(selfDelegationEntries);
  const availableToDelegate = maxYocto(
    BigInt(voteAmount) - BigInt(totalDelegatedFromStaking)
  );
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const cooldownEndsAt = BigInt(String(user?.next_action_timestamp ?? '0'));
  const isInCooldown = cooldownEndsAt > nowNs;
  const availableToWithdraw = isInCooldown ? '0' : availableToDelegate;
  const depositNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(availableToDelegate)
  );
  const delegateNeeded = maxYocto(
    BigInt(remainingToThreshold) - BigInt(depositNeeded)
  );
  const delegateActionStorageCost = getDelegationStorageCost(accountId);
  const additionalStorageNeeded = maxYocto(
    BigInt(delegateActionStorageCost) - BigInt(storageAvailable)
  );
  const delegateActionNearStorageNeeded = !isRegistered
    ? (
        BigInt(registrationStorageDeposit) + BigInt(additionalStorageNeeded)
      ).toString()
    : additionalStorageNeeded;

  return {
    daoAccountId,
    stakingContractId,
    requiredWeight,
    delegatedWeight,
    remainingToThreshold,
    walletBalance,
    nearBalance,
    voteAmount,
    availableToDelegate,
    selfDelegatedWeight,
    selfDelegationEntries,
    isRegistered,
    registrationStorageDeposit,
    delegateActionNearStorageNeeded,
    depositNeeded,
    delegateNeeded,
    isInCooldown,
    availableToWithdraw,
    canPropose: canProposeByWeight,
    isGroupMember,
    proposalBond,
  };
}
