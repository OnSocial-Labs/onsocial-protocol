import { createHash } from 'node:crypto';
import {
  DelegateAction,
  KeyPair,
  KeyType,
  PublicKey,
  Signature,
  actions,
  encodeDelegateAction,
  encodeSignedDelegate,
  type KeyPairString,
} from 'near-api-js';
import { config } from '../config/index.js';

export type RewardsDelegateAction =
  | {
      type: 'credit_reward';
      account_id: string;
      amount: string;
      source?: string;
      app_id?: string;
    }
  | {
      type: 'claim';
      account_id: string;
    };

export interface RelayerDelegateResult {
  success: boolean;
  status?: string;
  tx_hash?: string;
  error?: string;
  httpStatus: number;
}

interface DelegateSigner {
  accountId: string;
  publicKey: PublicKey;
  sign: (message: Uint8Array) => Uint8Array;
}

const GAS_REWARDS_EXECUTE = 100_000_000_000_000n;
const MAX_BLOCK_HEIGHT_DELTA = 100n;

/**
 * Server-signs a NEP-366 delegate for the rewards contract and submits it to
 * the delegate-only relayer. The delegate sender must be authorized by the
 * rewards contract for crediting app/global rewards.
 */
export async function relayRewardsAction(
  action: RewardsDelegateAction
): Promise<RelayerDelegateResult> {
  const signedDelegate = await buildRewardsSignedDelegate(action);

  const response = await fetch(
    `${config.relayerUrl}/execute_delegate?wait=true`,
    {
      method: 'POST',
      headers: relayerHeaders(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ signed_delegate: signedDelegate }),
    }
  );

  let data: Partial<RelayerDelegateResult> = {};
  try {
    data = (await response.json()) as Partial<RelayerDelegateResult>;
  } catch {
    data = {};
  }

  return {
    success: response.ok && data.success === true,
    status: data.status,
    tx_hash: data.tx_hash,
    error: data.error,
    httpStatus: response.status,
  };
}

export async function buildRewardsSignedDelegate(
  action: RewardsDelegateAction
): Promise<string> {
  const signer = getDelegateSigner();
  const accessKeyNonce = await fetchAccessKeyNonce(
    signer.accountId,
    signer.publicKey.toString()
  );
  const blockHeight = await fetchLatestBlockHeight();

  return buildSignedDelegate({
    senderId: signer.accountId,
    receiverId: config.rewardsContract,
    actions: [
      {
        methodName: 'execute',
        args: JSON.stringify({ request: { action } }),
        gas: GAS_REWARDS_EXECUTE,
        deposit: 0n,
      },
    ],
    nonce: accessKeyNonce + 1n,
    maxBlockHeight: blockHeight + MAX_BLOCK_HEIGHT_DELTA,
    publicKey: signer.publicKey,
    sign: signer.sign,
  });
}

function relayerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayerApiKey) {
    headers['X-Api-Key'] = config.relayerApiKey;
  }
  return headers;
}

function getDelegateSigner(): DelegateSigner {
  if (!config.rewardsDelegatePrivateKey) {
    throw new Error(
      'REWARDS_DELEGATE_PRIVATE_KEY or RELAYER_DELEGATE_PRIVATE_KEY must be set'
    );
  }
  const keyPair = KeyPair.fromString(
    config.rewardsDelegatePrivateKey as KeyPairString
  );
  const publicKey = keyPair.getPublicKey();
  if (publicKey.keyType !== KeyType.ED25519) {
    throw new Error('Only ed25519 delegate keys are supported');
  }
  return {
    accountId: config.rewardsDelegateAccount,
    publicKey,
    sign: (message: Uint8Array) => keyPair.sign(message).signature,
  };
}

async function fetchAccessKeyNonce(
  accountId: string,
  publicKey: string
): Promise<bigint> {
  const result = await rpcRequest<{ nonce: number | string }>('query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey,
  });
  return BigInt(result.nonce);
}

async function fetchLatestBlockHeight(): Promise<bigint> {
  try {
    const response = await fetch(`${config.relayerUrl}/latest_block`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        block_height?: number | string;
      };
      if (data.block_height !== undefined) {
        return BigInt(data.block_height);
      }
    }
  } catch {
    // Fall back to direct RPC below.
  }

  const result = await rpcRequest<{ header: { height: number | string } }>(
    'block',
    { finality: 'final' }
  );
  return BigInt(result.header.height);
}

async function rpcRequest<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(config.nearRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'backend-delegate',
      method,
      params,
    }),
  });

  const body = (await response.json()) as { result?: T; error?: unknown };
  if (!response.ok || !body.result) {
    throw new Error(`RPC ${method} failed: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

interface InnerFunctionCall {
  methodName: string;
  args: string;
  gas: bigint;
  deposit: bigint;
}

interface BuildSignedDelegateInput {
  senderId: string;
  receiverId: string;
  actions: InnerFunctionCall[];
  nonce: bigint;
  maxBlockHeight: bigint;
  publicKey: PublicKey;
  sign: (message: Uint8Array) => Uint8Array;
}

function buildSignedDelegate(input: BuildSignedDelegateInput): string {
  const delegateAction = new DelegateAction({
    senderId: input.senderId,
    receiverId: input.receiverId,
    actions: input.actions.map(encodeFunctionCallAction),
    nonce: input.nonce,
    maxBlockHeight: input.maxBlockHeight,
    publicKey: input.publicKey,
  });

  const delegateHash = sha256(encodeDelegateAction(delegateAction));
  const signature = input.sign(delegateHash);
  if (signature.length !== 64) {
    throw new Error(`delegate signer returned ${signature.length} bytes`);
  }

  const signedDelegate = {
    delegateAction,
    signature: new Signature({
      keyType: input.publicKey.keyType,
      data: signature,
    }),
  };
  return Buffer.from(encodeSignedDelegate(signedDelegate)).toString('base64');
}

function encodeFunctionCallAction(action: InnerFunctionCall) {
  return actions.functionCall(
    action.methodName,
    Buffer.from(action.args),
    action.gas,
    action.deposit
  );
}

function sha256(data: Uint8Array): Uint8Array {
  return createHash('sha256').update(data).digest();
}
