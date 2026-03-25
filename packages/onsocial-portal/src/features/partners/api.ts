import type { NearWalletBase } from '@hot-labs/near-connect';
import {
  ACTIVE_NEAR_NETWORK,
  GOVERNANCE_DAO_ACCOUNT,
  GOVERNANCE_PROPOSAL_BOND,
} from '@/lib/portal-config';
import { BACKEND_URL } from '@/features/partners/constants';
import { TOKEN_CONTRACT } from '@/lib/near-rpc';
import type {
  ApplyBody,
  ApplyResponse,
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

function extractTxHash(result: unknown): string | null {
  const outcome = result as {
    transaction_outcome?: { id?: string };
    transaction?: { hash?: string };
  };

  return outcome.transaction_outcome?.id ?? outcome.transaction?.hash ?? null;
}

function decodeBase64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function rotateKey(
  walletId: string,
  currentKey: string
): Promise<RotateResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/partners/rotate-key/${walletId}`, {
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
  const res = await fetch(`${BACKEND_URL}/v1/partners/status/${walletId}`);
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
    `${BACKEND_URL}/v1/partners/key-challenge/${walletId}`,
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

  const claimRes = await fetch(
    `${BACKEND_URL}/v1/partners/claim-key/${walletId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: signed.accountId,
        public_key: signed.publicKey,
        signature: signed.signature,
        message: challengeData.challenge.message,
      }),
    }
  );
  const claimData = (await claimRes.json()) as ClaimKeyResponse;
  if (!claimRes.ok) {
    throw new Error(claimData.error ?? 'Failed to claim API key');
  }
  return claimData;
}

export async function submitApplication(
  body: ApplyBody
): Promise<ApplyResponse> {
  const res = await fetch(`${BACKEND_URL}/v1/partners/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ApplyResponse;
  if (!res.ok) throw new Error(data.error ?? 'Application failed');
  return data;
}

export async function submitDirectGovernanceProposal(
  wallet: NearWalletBase,
  proposal: GovernanceProposal
): Promise<{ proposalId: number | null; txHash: string | null }> {
  if (!proposal.payload) {
    throw new Error('Governance proposal draft is missing');
  }

  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    receiverId: proposal.dao_account || GOVERNANCE_DAO_ACCOUNT,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: proposal.payload,
          gas: DAO_ADD_PROPOSAL_GAS,
          deposit: GOVERNANCE_PROPOSAL_BOND,
        },
      },
    ],
  });

  return {
    proposalId: decodeProposalId(result),
    txHash: extractTxHash(result),
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

  return extractTxHash(result);
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

  return extractTxHash(result);
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

  return extractTxHash(result);
}

export async function recordProposalSubmission(
  appId: string,
  walletId: string,
  proposalId: number | null,
  txHash: string
): Promise<ProposalSubmissionResponse> {
  const res = await fetch(
    `${BACKEND_URL}/v1/partners/proposal-submitted/${appId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_id: walletId,
        proposal_id: proposalId,
        tx_hash: txHash,
        submitted_at: new Date().toISOString(),
      }),
    }
  );
  const data = (await res.json()) as ProposalSubmissionResponse;
  if (!res.ok) throw new Error(data.error ?? 'Failed to record proposal');
  return data;
}
