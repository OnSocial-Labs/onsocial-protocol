import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_DAO_ACCOUNT,
  GOVERNANCE_PROPOSAL_BOND,
} from '@/lib/portal-config';
import { PARTNERS_API_BASE } from '@/features/partners/constants';
import {
  extractNearTransactionHashes,
  getGovernanceProposalBond,
  TOKEN_CONTRACT,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';
import type {
  AppIdAvailabilityResponse,
  ApplyBody,
  ApplyResponse,
  CancelApplicationResponse,
  ReopenApplicationResponse,
  ClaimKeyResponse,
  GovernanceProposal,
  KeyChallengeResponse,
  ProposalSubmissionResponse,
  RotateResponse,
  StatusResponse,
} from '@/features/partners/types';

const DAO_ADD_PROPOSAL_GAS = '300000000000000';
const GOVERNANCE_STAKING_GAS = '80000000000000';
const GOVERNANCE_TOKEN_TRANSFER_GAS = '100000000000000';

function decodeProposalId(result: unknown): number | null {
  const successValue = (result as { status?: { SuccessValue?: string } })
    ?.status?.SuccessValue;

  if (typeof successValue !== 'string') {
    return null;
  }

  const decoded = atob(successValue).trim();
  if (!decoded) {
    return null;
  }

  const normalized = decoded.replace(/^"|"$/g, '');
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function rotateKey(
  walletId: string,
  currentKey: string
): Promise<RotateResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/rotate-key/${walletId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': currentKey,
    },
  });
  const data = (await res.json()) as RotateResponse;
  if (!res.ok) throw new Error(data.error ?? 'Key rotation failed');
  return data;
}

export async function checkStatus(walletId: string): Promise<StatusResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/status/${walletId}`);
  if (!res.ok) throw new Error('Failed to check status');
  return (await res.json()) as StatusResponse;
}

export async function claimApiKey(
  wallet: NearWalletBase,
  walletId: string
): Promise<ClaimKeyResponse> {
  if (typeof wallet.signMessage !== 'function') {
    throw new Error('Connected wallet does not support message signing');
  }

  const challengeRes = await fetch(
    `${PARTNERS_API_BASE}/key-challenge/${walletId}`,
    { method: 'POST' }
  );
  const challengeData = (await challengeRes.json()) as KeyChallengeResponse;
  if (!challengeRes.ok || !challengeData.challenge) {
    throw new Error(challengeData.error ?? 'Failed to prepare API key claim');
  }

  const signed = await wallet.signMessage({
    network: ACTIVE_NEAR_NETWORK,
    signerId: walletId,
    message: challengeData.challenge.message,
    recipient: challengeData.challenge.recipient,
    nonce: decodeBase64ToBytes(challengeData.challenge.nonce),
  });

  const claimRes = await fetch(`${PARTNERS_API_BASE}/claim-key/${walletId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_id: signed.accountId,
      public_key: signed.publicKey,
      signature: signed.signature,
      message: challengeData.challenge.message,
    }),
  });
  const claimData = (await claimRes.json()) as ClaimKeyResponse;
  if (!claimRes.ok) {
    throw new Error(claimData.error ?? 'Failed to claim API key');
  }
  return claimData;
}

export async function submitApplication(
  body: ApplyBody
): Promise<ApplyResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ApplyResponse;
  if (!res.ok) throw new Error(data.error ?? 'Application failed');
  return data;
}

export async function checkAppIdAvailability(
  appId: string,
  walletId?: string
): Promise<AppIdAvailabilityResponse> {
  const query = walletId ? `?wallet_id=${encodeURIComponent(walletId)}` : '';
  const res = await fetch(
    `${PARTNERS_API_BASE}/app-id/${encodeURIComponent(appId)}${query}`
  );
  const data = (await res.json()) as AppIdAvailabilityResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Failed to check On-chain ID');
  }
  return data;
}

export async function cancelApplication(
  appId: string,
  walletId: string
): Promise<CancelApplicationResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/cancel/${appId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_id: walletId }),
  });
  const data = (await res.json()) as CancelApplicationResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Failed to cancel application');
  }
  return data;
}

export async function reopenApplication(
  appId: string,
  walletId: string
): Promise<ReopenApplicationResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/reopen/${appId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_id: walletId }),
  });
  const data = (await res.json()) as ReopenApplicationResponse;
  if (!res.ok) {
    throw new Error(data.error ?? 'Failed to reopen application');
  }
  return data;
}

export async function submitDirectGovernanceProposal(
  wallet: NearWalletBase,
  proposal: GovernanceProposal
): Promise<{ proposalId: number | null; txHash: string | null }> {
  if (!proposal.payload) {
    throw new Error('Governance proposal draft is missing');
  }

  const daoAccountId = proposal.dao_account || GOVERNANCE_DAO_ACCOUNT;
  const proposalBond =
    (await getGovernanceProposalBond(daoAccountId).catch(() => null)) ??
    GOVERNANCE_PROPOSAL_BOND;

  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: daoAccountId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: proposal.payload,
          gas: DAO_ADD_PROPOSAL_GAS,
          deposit: proposalBond,
        },
      },
    ],
  });

  return {
    proposalId: decodeProposalId(result),
    txHash: extractNearTransactionHashes(result)[0] ?? null,
  };
}

export async function registerGovernanceAccount(
  wallet: NearWalletBase,
  stakingContractId: string,
  accountId: string,
  storageDeposit: string
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: stakingContractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'storage_deposit',
          args: {
            account_id: accountId,
            registration_only: false,
          },
          gas: GOVERNANCE_STAKING_GAS,
          deposit: storageDeposit,
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function depositGovernanceTokens(
  wallet: NearWalletBase,
  stakingContractId: string,
  amount: string
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: TOKEN_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'ft_transfer_call',
          args: {
            receiver_id: stakingContractId,
            amount,
            msg: '',
          },
          gas: GOVERNANCE_TOKEN_TRANSFER_GAS,
          deposit: '1',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function prepareGovernanceDelegation(
  wallet: NearWalletBase,
  stakingContractId: string,
  accountId: string,
  {
    storageDeposit = '0',
    depositAmount = '0',
    delegateAmount = '0',
  }: {
    storageDeposit?: string;
    depositAmount?: string;
    delegateAmount?: string;
  }
): Promise<string[]> {
  const transactions: Array<{
    receiverId: string;
    actions: Array<{
      type: 'FunctionCall';
      params: {
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      };
    }>;
  }> = [];

  if (BigInt(storageDeposit) > 0n) {
    transactions.push({
      receiverId: stakingContractId,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'storage_deposit',
            args: {
              account_id: accountId,
              registration_only: false,
            },
            gas: GOVERNANCE_STAKING_GAS,
            deposit: storageDeposit,
          },
        },
      ],
    });
  }

  if (BigInt(depositAmount) > 0n) {
    transactions.push({
      receiverId: TOKEN_CONTRACT,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'ft_transfer_call',
            args: {
              receiver_id: stakingContractId,
              amount: depositAmount,
              msg: '',
            },
            gas: GOVERNANCE_TOKEN_TRANSFER_GAS,
            deposit: '1',
          },
        },
      ],
    });
  }

  if (BigInt(delegateAmount) > 0n) {
    transactions.push({
      receiverId: stakingContractId,
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'delegate',
            args: {
              account_id: accountId,
              amount: delegateAmount,
            },
            gas: GOVERNANCE_STAKING_GAS,
            deposit: '0',
          },
        },
      ],
    });
  }

  if (transactions.length === 0) {
    return [];
  }

  if (transactions.length === 1) {
    const [transaction] = transactions;
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      receiverId: transaction.receiverId,
      actions: transaction.actions,
    });

    return extractNearTransactionHashes(result);
  }

  const result = await wallet.signAndSendTransactions({
    network: ACTIVE_NEAR_NETWORK,
    transactions,
  });

  return extractNearTransactionHashes(result);
}

export type GovernanceDelegationPlan = {
  targetDelegateAmount: string;
  depositAmount: string;
  depositOnlyDuringCooldown: boolean;
  delegateStorageLimitReached: boolean;
  requiredNearStorage: string;
  storageDeposit: string;
  delegateAmount: string;
  needsBatch: boolean;
};

export function buildGovernanceDelegationPlan(
  eligibility: GovernanceEligibilitySnapshot,
  targetDelegateAmount: bigint,
  options?: {
    treatCooldownAmountAsDeposit?: boolean;
  }
): GovernanceDelegationPlan {
  const availableToDelegate = BigInt(eligibility.availableToDelegate);
  const treatCooldownAmountAsDeposit =
    options?.treatCooldownAmountAsDeposit === true && eligibility.isInCooldown;
  const depositAmount = treatCooldownAmountAsDeposit
    ? targetDelegateAmount
    : targetDelegateAmount > availableToDelegate
      ? targetDelegateAmount - availableToDelegate
      : 0n;
  const depositOnlyDuringCooldown =
    eligibility.isInCooldown && depositAmount > 0n;
  const delegateStorageLimitReached =
    !depositOnlyDuringCooldown &&
    eligibility.isRegistered &&
    BigInt(eligibility.delegateActionNearStorageNeeded) > 0n;
  const requiredNearStorage = depositOnlyDuringCooldown
    ? eligibility.isRegistered
      ? 0n
      : BigInt(eligibility.registrationStorageDeposit)
    : BigInt(eligibility.delegateActionNearStorageNeeded);
  const storageDeposit = depositOnlyDuringCooldown
    ? eligibility.isRegistered
      ? 0n
      : BigInt(eligibility.registrationStorageDeposit)
    : eligibility.isRegistered
      ? 0n
      : BigInt(eligibility.delegateActionNearStorageNeeded);
  const delegateAmount = depositOnlyDuringCooldown ? 0n : targetDelegateAmount;

  return {
    targetDelegateAmount: targetDelegateAmount.toString(),
    depositAmount: depositAmount.toString(),
    depositOnlyDuringCooldown,
    delegateStorageLimitReached,
    requiredNearStorage: requiredNearStorage.toString(),
    storageDeposit: storageDeposit.toString(),
    delegateAmount: delegateAmount.toString(),
    needsBatch: storageDeposit > 0n || depositAmount > 0n,
  };
}

export async function selfDelegateGovernanceTokens(
  wallet: NearWalletBase,
  stakingContractId: string,
  accountId: string,
  amount: string
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: stakingContractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'delegate',
          args: {
            account_id: accountId,
            amount,
          },
          gas: GOVERNANCE_STAKING_GAS,
          deposit: '0',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function undelegateGovernanceTokens(
  wallet: NearWalletBase,
  stakingContractId: string,
  accountId: string,
  amount: string
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: stakingContractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'undelegate',
          args: {
            account_id: accountId,
            amount,
          },
          gas: GOVERNANCE_STAKING_GAS,
          deposit: '0',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function undelegateGovernanceEntries(
  wallet: NearWalletBase,
  stakingContractId: string,
  accountId: string,
  amounts: string[]
): Promise<string | null> {
  const normalizedAmounts = amounts.filter(
    (amount) => BigInt(amount || '0') > 0n
  );

  if (normalizedAmounts.length === 0) {
    return null;
  }

  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: stakingContractId,
    actions: normalizedAmounts.map((amount) => ({
      type: 'FunctionCall' as const,
      params: {
        methodName: 'undelegate',
        args: {
          account_id: accountId,
          amount,
        },
        gas: GOVERNANCE_STAKING_GAS,
        deposit: '0',
      },
    })),
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function withdrawGovernanceTokens(
  wallet: NearWalletBase,
  stakingContractId: string,
  amount: string
): Promise<string | null> {
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: stakingContractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'withdraw',
          args: {
            amount,
          },
          gas: GOVERNANCE_STAKING_GAS,
          deposit: '0',
        },
      },
    ],
  });

  return extractNearTransactionHashes(result)[0] ?? null;
}

export async function recordProposalSubmission(
  appId: string,
  walletId: string,
  proposalId: number | null,
  txHash: string
): Promise<ProposalSubmissionResponse> {
  const res = await fetch(`${PARTNERS_API_BASE}/proposal-submitted/${appId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_id: walletId,
      proposal_id: proposalId,
      tx_hash: txHash,
      submitted_at: new Date().toISOString(),
    }),
  });
  const data = (await res.json()) as ProposalSubmissionResponse;
  if (!res.ok) throw new Error(data.error ?? 'Failed to record proposal');
  return data;
}
