import {
  baseDecode,
  baseEncode,
  decodeSignedTransaction,
  KeyPair,
  type Action,
} from 'near-api-js';
import { describe, expect, it } from 'vitest';
import { TESTNET_FT_TEMPLATE_CODE_HASH } from '@/lib/app-ft-template-config';
import type { FtFactoryFinishInput } from '@/lib/ft-factory-client';
import {
  decideFinishPlan,
  finishCreatorToken,
  parseCreateAction,
  verifyCreateTransaction,
  type FactoryRpc,
} from '@/server/ft-factory-tx';

const CREATE_TX = '11111111111111111111111111111111111111111111';
const BLOCK_HASH = baseEncode(new Uint8Array(32).fill(7));
const CONTRACT_ID = 'cool.alice.testnet';
const PARENT = 'alice.testnet';
const ICON = 'data:image/svg+xml,x';

const pair = KeyPair.fromRandom('ed25519');
const SECRET = pair.toString();
const PUBLIC_KEY = pair.getPublicKey().toString();

const INPUT: FtFactoryFinishInput = {
  createTxHash: CREATE_TX,
  contractId: CONTRACT_ID,
  name: 'Cool Token',
  symbol: 'COOL',
  totalSupply: '1000000000000000000',
  icon: ICON,
  renounceOwner: false,
};

function createActions(publicKey = PUBLIC_KEY) {
  return [
    { CreateAccount: {} },
    { Transfer: { deposit: '500000000000000000000000' } },
    {
      AddKey: {
        public_key: publicKey,
        access_key: { nonce: 0, permission: 'FullAccess' },
      },
    },
  ];
}

function createStatus(
  patch?: Partial<{
    final_execution_status: string;
    signer_id: string;
    receiver_id: string;
    actions: unknown[];
  }>
) {
  return {
    final_execution_status: patch?.final_execution_status ?? 'FINAL',
    status: { SuccessValue: '' },
    transaction: {
      signer_id: patch?.signer_id ?? PARENT,
      receiver_id: patch?.receiver_id ?? CONTRACT_ID,
      actions: patch?.actions ?? createActions(),
    },
  };
}

interface Script {
  codeHash?: string | null;
  initialized?: boolean;
  owner?: string;
  keyGone?: boolean;
  nonceFailures?: number;
  create?: ReturnType<typeof createStatus>;
  templateMissing?: boolean;
}

function scriptedRpc(script: Script = {}) {
  let keyGone = script.keyGone ?? false;
  let nonceFailures = script.nonceFailures ?? 0;
  const calls: string[] = [];
  let lastSigned = '';
  const rpc: FactoryRpc & { calls: string[]; lastSigned: () => string } = {
    calls,
    lastSigned: () => lastSigned,
    async call<T>(method: string, params: unknown): Promise<T> {
      calls.push(method);
      if (method === 'query') {
        const query = params as { request_type?: string; method_name?: string };
        if (query.request_type === 'view_global_contract_code') {
          if (script.templateMissing) {
            throw new Error('NO_GLOBAL_CONTRACT_CODE: no global contract');
          }
          return {
            hash: TESTNET_FT_TEMPLATE_CODE_HASH,
            code_base64: 'YQ==',
          } as T;
        }
        if (query.request_type === 'view_access_key') {
          if (keyGone) throw new Error('Access key does not exist');
          return { nonce: 4, permission: 'FullAccess' } as T;
        }
        if (query.request_type === 'view_code') {
          if (!script.codeHash) throw new Error("Contract code doesn't exist");
          return { hash: script.codeHash, code_base64: 'YQ==' } as T;
        }
        if (query.method_name === 'ft_metadata') {
          if (!script.initialized)
            throw new Error('The contract is not initialized');
          return { result: [...Buffer.from('{}')] } as T;
        }
        if (query.method_name === 'get_owner') {
          return {
            result: [...Buffer.from(JSON.stringify(script.owner ?? PARENT))],
          } as T;
        }
      }
      if (method === 'EXPERIMENTAL_tx_status') {
        const hash = (params as string[])[0];
        if (hash === CREATE_TX) return (script.create ?? createStatus()) as T;
        return {
          final_execution_status: 'FINAL',
          status: { SuccessValue: '' },
        } as T;
      }
      if (method === 'block') {
        return { header: { hash: BLOCK_HASH } } as T;
      }
      if (method === 'broadcast_tx_commit') {
        if (nonceFailures > 0) {
          nonceFailures -= 1;
          throw new Error('Invalid nonce');
        }
        lastSigned = (params as string[])[0] ?? '';
        keyGone = true;
        return { status: { SuccessValue: '' } } as T;
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  return rpc;
}

function decodeActions(signedTxBase64: string): Action[] {
  const bytes = Uint8Array.from(Buffer.from(signedTxBase64, 'base64'));
  return decodeSignedTransaction(bytes).transaction.actions;
}

function actionKind(action: Action): string {
  return Object.keys(action)[0] ?? '';
}

function callArgs(action: Action): {
  methodName: string;
  args: Record<string, unknown>;
} {
  const call = (
    action as Action & {
      functionCall?: { methodName: string; args: Uint8Array };
    }
  ).functionCall;
  if (!call) throw new Error('not a function call');
  return {
    methodName: call.methodName,
    args: JSON.parse(Buffer.from(call.args).toString('utf8')) as Record<
      string,
      unknown
    >,
  };
}

const template = {
  kind: 'codeHash' as const,
  codeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
};

async function finish(
  script: Script = {},
  input: FtFactoryFinishInput = INPUT
) {
  const rpc = scriptedRpc(script);
  const result = await finishCreatorToken(input, {
    rpc,
    secretKey: SECRET,
    template,
    sleep: async () => {},
    pollIntervalMs: 0,
    pollTimeoutMs: 5_000,
  });
  return { result, rpc };
}

describe('verifyCreateTransaction', () => {
  it('accepts the chain shape and the wallet shape', () => {
    expect(parseCreateAction('CreateAccount')).toEqual({
      kind: 'CreateAccount',
    });
    expect(
      parseCreateAction({
        type: 'AddKey',
        params: {
          publicKey: PUBLIC_KEY,
          accessKey: { permission: 'FullAccess' },
        },
      })
    ).toMatchObject({ kind: 'AddKey', publicKey: PUBLIC_KEY });
  });

  it('requires a final parent create that adds our full-access key', () => {
    expect(
      verifyCreateTransaction({
        status: createStatus(),
        contractId: CONTRACT_ID,
        factoryPublicKey: PUBLIC_KEY,
      }).ok
    ).toBe(true);

    const notFinal = verifyCreateTransaction({
      status: createStatus({ final_execution_status: 'EXECUTED' }),
      contractId: CONTRACT_ID,
      factoryPublicKey: PUBLIC_KEY,
    });
    expect(notFinal.ok).toBe(false);
    if (!notFinal.ok) expect(notFinal.retryable).toBe(true);

    const nested = verifyCreateTransaction({
      status: createStatus({
        signer_id: PARENT,
        receiver_id: 'evil.cool.alice.testnet',
      }),
      contractId: 'evil.cool.alice.testnet',
      factoryPublicKey: PUBLIC_KEY,
    });
    expect(nested.ok).toBe(false);

    const limited = verifyCreateTransaction({
      status: createStatus({
        actions: [
          'CreateAccount',
          { Transfer: { deposit: '1' } },
          {
            AddKey: {
              public_key: PUBLIC_KEY,
              access_key: {
                permission: {
                  FunctionCall: {
                    receiver_id: CONTRACT_ID,
                    method_names: [],
                  },
                },
              },
            },
          },
        ],
      }),
      contractId: CONTRACT_ID,
      factoryPublicKey: PUBLIC_KEY,
    });
    expect(limited.ok).toBe(false);
  });
});

describe('decideFinishPlan', () => {
  it('refuses a different code hash and does not treat a missing key as success', () => {
    expect(
      decideFinishPlan({
        codeHash: 'other-hash',
        expectedCodeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
        factoryKeyPresent: true,
        initialized: false,
      })
    ).toMatchObject({ kind: 'stop', code: 'refused' });

    expect(
      decideFinishPlan({
        codeHash: null,
        expectedCodeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
        factoryKeyPresent: false,
        initialized: false,
      })
    ).toMatchObject({ kind: 'stop', retryable: false });

    expect(
      decideFinishPlan({
        codeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
        expectedCodeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
        factoryKeyPresent: false,
        initialized: true,
      })
    ).toEqual({ kind: 'done' });
  });
});

describe('finishCreatorToken', () => {
  it('installs the base58 code hash, mints to the parent, and deletes the key', async () => {
    const bytes = baseDecode(TESTNET_FT_TEMPLATE_CODE_HASH);
    expect(bytes).toHaveLength(32);
    expect(Buffer.from(TESTNET_FT_TEMPLATE_CODE_HASH, 'hex')).not.toHaveLength(
      32
    );

    const { result, rpc } = await finish({}, { ...INPUT, renounceOwner: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.txHash).not.toBe(CREATE_TX);

    const actions = decodeActions(rpc.lastSigned());
    expect(actions.map(actionKind)).toEqual([
      'useGlobalContract',
      'functionCall',
      'deleteKey',
    ]);
    const deploy = actions[0] as Action & {
      useGlobalContract?: { contractIdentifier: { CodeHash?: Uint8Array } };
    };
    expect(
      Array.from(deploy.useGlobalContract?.contractIdentifier.CodeHash ?? [])
    ).toEqual(Array.from(bytes));
    expect(callArgs(actions[1]!).args).toMatchObject({
      owner_id: PARENT,
      name: 'Cool Token',
      symbol: 'COOL',
      total_supply: INPUT.totalSupply,
    });
    expect(
      rpc.calls.filter((method) => method === 'broadcast_tx_commit')
    ).toHaveLength(1);
  });

  it('retries a nonce error and then removes the key', async () => {
    const { result, rpc } = await finish({ nonceFailures: 1 });
    expect(result.ok).toBe(true);
    expect(
      rpc.calls.filter((method) => method === 'broadcast_tx_commit')
    ).toHaveLength(2);
  });

  it('does not broadcast when the code hash does not match', async () => {
    const { result, rpc } = await finish({ codeHash: 'not-the-template' });
    expect(result).toMatchObject({
      ok: false,
      code: 'refused',
      retryable: false,
    });
    expect(rpc.calls).not.toContain('broadcast_tx_commit');
  });

  it('returns success when the template is already live and the key is gone', async () => {
    const { result, rpc } = await finish({
      codeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
      initialized: true,
      keyGone: true,
    });
    expect(result).toEqual({ ok: true, txHash: CREATE_TX });
    expect(rpc.calls).not.toContain('broadcast_tx_commit');
  });

  it('drops only the key when the matching token is already initialized', async () => {
    const { result, rpc } = await finish({
      codeHash: TESTNET_FT_TEMPLATE_CODE_HASH,
      initialized: true,
      owner: PARENT,
    });
    expect(result.ok).toBe(true);
    expect(decodeActions(rpc.lastSigned()).map(actionKind)).toEqual([
      'deleteKey',
    ]);
  });

  it('does not sign a create transaction from a different account', async () => {
    const { result, rpc } = await finish({
      create: createStatus({ signer_id: 'bob.testnet' }),
    });
    expect(result.ok).toBe(false);
    expect(rpc.calls).not.toContain('broadcast_tx_commit');
  });
});
