import {
  GOVERNANCE_DAO_ACCOUNT,
  SOCIAL_TOKEN_CONTRACT,
  STAKING_GOVERNANCE_DAO_ACCOUNT,
  STAKING_TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import {
  getSpendableNearBalance,
  normalizeFtBalanceYocto,
  viewAccount,
  viewNearContract,
  type NearAccountView,
} from '@/lib/app-near-rpc';
import {
  defaultForeignStakeTokenLabel,
  getMemberProposeThreshold,
  isProtocolDaoGroupMember,
  resolveStakeProposeKind,
  viewerCanAddProposalOnPolicy,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
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
  /** Staking contract `next_action_timestamp` (ns) when cooldown is active. */
  nextActionTimestamp: string;
  /** Nanoseconds until cooldown ends; `0` when not in cooldown. */
  cooldownRemainingNs: string;
  availableToWithdraw: string;
  /** Member-role stake threshold met (weight only). */
  canPropose: boolean;
  /** Viewer is listed on a Group role (any Group, including vote-only). */
  isGroupMember: boolean;
  /**
   * This DAO's policy: Everyone, a proposing Group, or Member weight.
   * Use for Manage / mood / Boost / claim / As-DAO entry.
   */
  canAddProposal: boolean;
  /** Member propose role + SOCIAL staking contract — our Stake sheet can unlock. */
  hasStakeProposePath: boolean;
  /**
   * Member propose role + a non-SOCIAL (or unknown) staking token.
   * Block propose; do not offer SOCIAL Stake.
   */
  foreignStakeTokenLabel: string | null;
  proposalBond: string;
}

/**
 * Effective propose right from this DAO's policy (not "any Group").
 * Keep `canPropose` for stake-sheet weight copy.
 */
export function viewerCanProposeOnDao(
  eligibility:
    | (Pick<ProtocolGovernanceEligibility, 'canPropose' | 'isGroupMember'> &
        Partial<Pick<ProtocolGovernanceEligibility, 'canAddProposal'>>)
    | null
    | undefined
): boolean {
  if (!eligibility) return false;
  if (typeof eligibility.canAddProposal === 'boolean') {
    return eligibility.canAddProposal;
  }
  return Boolean(eligibility.isGroupMember || eligibility.canPropose);
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

async function tryViewAccount(
  accountId: string
): Promise<NearAccountView | null> {
  try {
    return await viewAccount(accountId);
  } catch {
    return null;
  }
}

function getDelegationStorageCost(accountId: string): string {
  const bytes = BigInt(accountId.length) + DELEGATION_STORAGE_BYTES_OVERHEAD;
  return (bytes * NEAR_STORAGE_BYTE_COST).toString();
}

const KNOWN_SOCIAL_STAKING_CONTRACTS = [
  STAKING_GOVERNANCE_DAO_ACCOUNT,
  STAKING_TREASURY_DAO_ACCOUNT,
] as const;

const STAKE_TOKEN_VIEW_METHODS = [
  'get_token_id',
  'get_ft_contract_id',
  'get_vote_token_id',
] as const;

function resolveEligibilityRights(
  policy: ProtocolDaoPolicy | null,
  accountId: string,
  delegatedWeight: string,
  stakingContractId: string | null,
  stakeTokenId: string | null,
  foreignStakeTokenLabel: string | null
): {
  requiredWeight: string;
  remainingToThreshold: string;
  canProposeByWeight: boolean;
  isGroupMember: boolean;
  canAddProposal: boolean;
  hasStakeProposePath: boolean;
  foreignStakeTokenLabel: string | null;
} {
  const memberThreshold = getMemberProposeThreshold(policy);
  const hasMemberProposeRole = memberThreshold != null;
  const requiredWeight = memberThreshold ?? '0';
  const remainingToThreshold = hasMemberProposeRole
    ? maxYocto(BigInt(requiredWeight) - BigInt(delegatedWeight))
    : '0';
  const stakeKind = resolveStakeProposeKind({
    hasMemberProposeRole,
    stakingContractId,
    stakeTokenId,
    socialTokenId: SOCIAL_TOKEN_CONTRACT,
    knownSocialStakingIds: KNOWN_SOCIAL_STAKING_CONTRACTS,
  });
  return {
    requiredWeight,
    remainingToThreshold,
    canProposeByWeight:
      hasMemberProposeRole &&
      BigInt(delegatedWeight) >= BigInt(requiredWeight),
    isGroupMember: isProtocolDaoGroupMember(policy, accountId),
    canAddProposal: viewerCanAddProposalOnPolicy(
      policy,
      accountId,
      delegatedWeight
    ),
    hasStakeProposePath: stakeKind === 'social',
    foreignStakeTokenLabel:
      stakeKind === 'foreign'
        ? (foreignStakeTokenLabel ?? defaultForeignStakeTokenLabel(stakeTokenId))
        : null,
  };
}

function firstNonEmptyString(values: Array<string | null>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function getStakingVoteTokenId(
  stakingContractId: string
): Promise<string | null> {
  const hits = await Promise.all(
    STAKE_TOKEN_VIEW_METHODS.map((method) =>
      tryViewNearContract<string>(stakingContractId, method)
    )
  );
  return firstNonEmptyString(hits.map((value) => value));
}

async function getFtSymbol(tokenId: string): Promise<string | null> {
  const meta = await tryViewNearContract<{ symbol?: string }>(
    tokenId,
    'ft_metadata'
  );
  const symbol = meta?.symbol?.trim();
  return symbol || null;
}

async function resolveStakeTokenContext(
  stakingContractId: string | null
): Promise<{ stakeTokenId: string | null; foreignStakeTokenLabel: string | null }> {
  if (!stakingContractId) {
    return { stakeTokenId: null, foreignStakeTokenLabel: null };
  }
  const knownSocial = KNOWN_SOCIAL_STAKING_CONTRACTS.some(
    (id) => id.trim().toLowerCase() === stakingContractId.toLowerCase()
  );
  if (knownSocial) {
    return {
      stakeTokenId: SOCIAL_TOKEN_CONTRACT,
      foreignStakeTokenLabel: null,
    };
  }
  const stakeTokenId = await getStakingVoteTokenId(stakingContractId);
  if (
    stakeTokenId &&
    stakeTokenId.toLowerCase() === SOCIAL_TOKEN_CONTRACT.toLowerCase()
  ) {
    return { stakeTokenId, foreignStakeTokenLabel: null };
  }
  const symbol = stakeTokenId ? await getFtSymbol(stakeTokenId) : null;
  return {
    stakeTokenId,
    foreignStakeTokenLabel: symbol || defaultForeignStakeTokenLabel(stakeTokenId),
  };
}

export async function getProtocolDaoStakeProposePath(
  daoAccountId: string
): Promise<boolean> {
  const [policy, stakingContractRaw] = await Promise.all([
    tryViewNearContract<ProtocolDaoPolicy>(daoAccountId, 'get_policy'),
    tryViewNearContract<string>(daoAccountId, 'get_staking_contract'),
  ]);
  const stakingContractId = stakingContractRaw?.trim() || null;
  const { stakeTokenId } = await resolveStakeTokenContext(stakingContractId);
  return (
    resolveStakeProposeKind({
      hasMemberProposeRole: getMemberProposeThreshold(policy) != null,
      stakingContractId,
      stakeTokenId,
      socialTokenId: SOCIAL_TOKEN_CONTRACT,
      knownSocialStakingIds: KNOWN_SOCIAL_STAKING_CONTRACTS,
    }) === 'social'
  );
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

const ELIGIBILITY_TTL_MS = 20_000;
const eligibilityCache = new Map<
  string,
  { at: number; value: ProtocolGovernanceEligibility }
>();
const eligibilityInflight = new Map<
  string,
  Promise<ProtocolGovernanceEligibility>
>();

function eligibilityCacheKey(accountId: string, daoAccountId: string): string {
  return `${accountId.trim().toLowerCase()}::${daoAccountId.trim().toLowerCase()}`;
}

export function invalidateProtocolGovernanceEligibility(
  accountId?: string,
  daoAccountId?: string
): void {
  if (!accountId && !daoAccountId) {
    eligibilityCache.clear();
    return;
  }
  const account = accountId?.trim().toLowerCase() ?? '';
  const dao = daoAccountId?.trim().toLowerCase() ?? '';
  for (const key of eligibilityCache.keys()) {
    const [cachedAccount, cachedDao] = key.split('::');
    if (account && cachedAccount !== account) continue;
    if (dao && cachedDao !== dao) continue;
    eligibilityCache.delete(key);
  }
}

export async function getProtocolGovernanceEligibility(
  accountId: string,
  daoAccountId = GOVERNANCE_DAO_ACCOUNT,
  opts?: { fresh?: boolean }
): Promise<ProtocolGovernanceEligibility> {
  const key = eligibilityCacheKey(accountId, daoAccountId);
  if (opts?.fresh) {
    eligibilityCache.delete(key);
  } else {
    const hit = eligibilityCache.get(key);
    if (hit && Date.now() - hit.at < ELIGIBILITY_TTL_MS) {
      return hit.value;
    }
    const pending = eligibilityInflight.get(key);
    if (pending) return pending;
  }

  const task = loadProtocolGovernanceEligibility(accountId, daoAccountId)
    .then((value) => {
      if (eligibilityInflight.get(key) === task) {
        eligibilityCache.set(key, { at: Date.now(), value });
      }
      return value;
    })
    .finally(() => {
      if (eligibilityInflight.get(key) === task) {
        eligibilityInflight.delete(key);
      }
    });
  eligibilityInflight.set(key, task);
  return task;
}

async function loadProtocolGovernanceEligibility(
  accountId: string,
  daoAccountId: string
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
    tryViewAccount(accountId),
  ]);

  const delegatedWeight = String(delegatedWeightRaw ?? '0');
  const walletBalance = normalizeFtBalanceYocto(walletBalanceRaw).toString();
  const nearBalance = getSpendableNearBalance(nearAccount);
  const proposalBond = policy?.proposal_bond ?? '0';
  const stakingContractId = stakingContractRaw?.trim() || null;
  const { stakeTokenId, foreignStakeTokenLabel } =
    await resolveStakeTokenContext(stakingContractId);
  const rights = resolveEligibilityRights(
    policy,
    accountId,
    delegatedWeight,
    stakingContractId,
    stakeTokenId,
    foreignStakeTokenLabel
  );
  const {
    requiredWeight,
    remainingToThreshold,
    canProposeByWeight,
    isGroupMember,
    canAddProposal,
    hasStakeProposePath,
    foreignStakeTokenLabel: foreignLabel,
  } = rights;

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
      nextActionTimestamp: '0',
      cooldownRemainingNs: '0',
      availableToWithdraw: '0',
      canPropose: canProposeByWeight,
      isGroupMember,
      canAddProposal,
      hasStakeProposePath,
      foreignStakeTokenLabel: foreignLabel,
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
  const nextActionTimestamp = String(user?.next_action_timestamp ?? '0');
  const cooldownEndsAt = BigInt(nextActionTimestamp || '0');
  const isInCooldown = cooldownEndsAt > nowNs;
  const cooldownRemainingNs = isInCooldown
    ? (cooldownEndsAt - nowNs).toString()
    : '0';
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
    nextActionTimestamp,
    cooldownRemainingNs,
    availableToWithdraw,
    canPropose: canProposeByWeight,
    isGroupMember,
    canAddProposal,
    hasStakeProposePath,
    foreignStakeTokenLabel: foreignLabel,
    proposalBond,
  };
}
