// ---------------------------------------------------------------------------
// session-bridge tests — verifies prepare→sign→relay/signed pipeline
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLatestBlockCache,
  composeAndSign,
  SessionRequiredError,
} from './session-bridge.js';
import {
  NeedsWalletConfirmationError,
  type Session,
} from '../advanced/session.js';
import type { HttpClient } from './http.js';

beforeEach(() => {
  __resetLatestBlockCache();
});

function makeHttp(responses: Record<string, unknown>): HttpClient {
  return {
    get: vi.fn(async (path: string) => {
      if (!(path in responses)) {
        throw new Error(`unexpected GET to ${path}`);
      }
      return responses[path];
    }),
    post: vi.fn(async (path: string) => {
      if (!(path in responses)) {
        throw new Error(`unexpected POST to ${path}`);
      }
      return responses[path];
    }),
  } as unknown as HttpClient;
}

function makeSession(opts: { supportsAttachedDeposit?: boolean } = {}): Session {
  return {
    supportsAttachedDeposit: opts.supportsAttachedDeposit ?? false,
    signComposeDelegate: vi.fn(async () => ({
      base64: 'BASE64_DELEGATE_BLOB',
      nonce: 1,
    })),
  } as unknown as Session;
}

describe('composeAndSign', () => {
  it('throws SessionRequiredError when no session is attached', async () => {
    const http = makeHttp({});
    await expect(
      composeAndSign(http, null, 'set', { foo: 'bar' }, 'social.setProfile')
    ).rejects.toBeInstanceOf(SessionRequiredError);
  });

  it('runs the prepare → sign → relay/delegate pipeline', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
        target_account: 'core.onsocial.testnet',
      },
      '/relay/latest-block': { block_height: 12345 },
      '/relay/delegate': { txHash: 'tx_abc' },
    });
    const session = makeSession({ supportsAttachedDeposit: true });

    const result = await composeAndSign(
      http,
      session,
      'set',
      { path: 'profile/name', value: 'Alice' },
      'social.set'
    );

    expect(result).toEqual({ txHash: 'tx_abc' });
    expect(http.post).toHaveBeenNthCalledWith(1, '/compose/prepare/set', {
      path: 'profile/name',
      value: 'Alice',
    });
    expect(http.post).toHaveBeenLastCalledWith('/relay/delegate', {
      signed_delegate: 'BASE64_DELEGATE_BLOB',
    });
    expect(session.signComposeDelegate).toHaveBeenCalledWith({
      action: { type: 'set', data: { 'profile/name': 'Alice' } },
      targetContract: 'core.onsocial.testnet',
      maxBlockHeight: 12345n + 1000n,
    });
  });

  it('throws when prepare response has no action', async () => {
    const http = makeHttp({
      '/compose/prepare/set': { target_account: 'x.testnet' },
    });
    const session = makeSession({ supportsAttachedDeposit: true });
    await expect(composeAndSign(http, session, 'set', {}, 'x')).rejects.toThrow(
      /did not return a valid action/
    );
  });

  it('passes empty body as {} when body is undefined', async () => {
    const http = makeHttp({
      '/compose/prepare/noop': {
        action: { type: 'noop' },
        target_account: 't.testnet',
      },
      '/relay/latest-block': { block_height: 1 },
      '/relay/delegate': { txHash: 'tx' },
    });
    const session = makeSession();
    await composeAndSign(http, session, 'noop', undefined);
    expect(http.post).toHaveBeenNthCalledWith(1, '/compose/prepare/noop', {});
  });

  it('passes prepared deposit hints into the delegated FunctionCall', async () => {
    const http = makeHttp({
      '/compose/prepare/set-confirmed': {
        action: { type: 'set_confirmed' },
        target_account: 'core.onsocial.testnet',
        deposit_yocto: '1',
      },
      '/relay/latest-block': { block_height: 1 },
      '/relay/delegate': { txHash: 'tx' },
    });
    const session = makeSession({ supportsAttachedDeposit: true });

    await composeAndSign(http, session, 'set-confirmed', {});

    expect(session.signComposeDelegate).toHaveBeenCalledWith({
      action: { type: 'set_confirmed' },
      targetContract: 'core.onsocial.testnet',
      maxBlockHeight: 1001n,
      depositYocto: '1',
    });
  });

  it('rejects confirmation deposits for FunctionCall-key delegate sessions', async () => {
    const http = makeHttp({
      '/compose/prepare/set-confirmed': {
        action: { type: 'set_confirmed' },
        target_account: 'core.onsocial.testnet',
        deposit_yocto: '1',
      },
    });
    const session = makeSession();

    await expect(
      composeAndSign(http, session, 'set-confirmed', {}, 'core.setConfirmed')
    ).rejects.toMatchObject({
      code: 'NEEDS_WALLET_CONFIRMATION',
      reason: 'attached_deposit_required',
    });
    await expect(
      composeAndSign(http, session, 'set-confirmed', {}, 'core.setConfirmed')
    ).rejects.toBeInstanceOf(NeedsWalletConfirmationError);
    expect(http.get).not.toHaveBeenCalled();
    expect(session.signComposeDelegate).not.toHaveBeenCalled();
  });

  it('rejects value deposits through the gateway delegate relayer', async () => {
    const http = makeHttp({
      '/compose/prepare/storage-deposit': {
        action: { type: 'storage_deposit' },
        target_account: 'scarces.onsocial.testnet',
        deposit_yocto: '100000000000000000000000',
      },
    });
    const session = makeSession({ supportsAttachedDeposit: true });

    await expect(
      composeAndSign(
        http,
        session,
        'storage-deposit',
        {},
        'scarces.storage.deposit'
      )
    ).rejects.toMatchObject({
      code: 'NEEDS_WALLET_CONFIRMATION',
      reason: 'value_deposit_required',
    });
    expect(http.get).not.toHaveBeenCalled();
    expect(session.signComposeDelegate).not.toHaveBeenCalled();
  });
});

describe('composeAndSign — delegate mode', () => {
  it('routes through /relay/delegate', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
        target_account: 'core.onsocial.testnet',
      },
      '/relay/latest-block': { block_hash: 'B', block_height: 12345 },
      '/relay/delegate': { txHash: 'tx_delegate' },
    });
    const session = {
      signComposeDelegate: vi.fn(async () => ({
        base64: 'BASE64_DELEGATE_BLOB',
        nonce: 7,
      })),
    } as unknown as Session;

    const result = await composeAndSign(
      http,
      session,
      'set',
      { path: 'profile/name', value: 'Alice' },
      'social.set'
    );

    expect(result).toEqual({ txHash: 'tx_delegate' });
    expect(session.signComposeDelegate).toHaveBeenCalledWith({
      action: { type: 'set', data: { 'profile/name': 'Alice' } },
      targetContract: 'core.onsocial.testnet',
      maxBlockHeight: 12345n + 1000n,
    });
    expect(http.post).toHaveBeenLastCalledWith('/relay/delegate', {
      signed_delegate: 'BASE64_DELEGATE_BLOB',
    });
  });

  it('end-to-end: real Session produces a decodable SignedDelegateAction', async () => {
    const { generateEd25519Key } = await import('../advanced/bootstrap.js');
    const { Session: RealSession } = await import('../advanced/session.js');

    const hasEd25519 = await (async () => {
      const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } })
        .crypto?.subtle;
      if (!subtle) return false;
      try {
        await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
        return true;
      } catch {
        return false;
      }
    })();
    if (!hasEd25519) return;

    const key = await generateEd25519Key();
    const session = new RealSession({
      network: 'testnet',
      accountId: 'alice.testnet',
      contract: 'core',
      contractId: 'core.onsocial.testnet',
      key: { publicKey: key.publicKey, sign: key.sign },
      canAttachDeposit: true,
    });

    let postedBlob = '';
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
        target_account: 'core.onsocial.testnet',
      },
      '/relay/latest-block': { block_hash: 'B', block_height: 555 },
      '/relay/delegate': { txHash: 'tx_e2e' },
    });
    // Capture the body of the /relay/delegate POST.
    const realPost = http.post as unknown as ReturnType<typeof vi.fn>;
    realPost.mockImplementation(async (path: string, body: unknown) => {
      if (path === '/relay/delegate') {
        postedBlob = (body as { signed_delegate: string }).signed_delegate;
        return { txHash: 'tx_e2e' };
      }
      if (path === '/compose/prepare/set') {
        return {
          action: { type: 'set', data: { 'profile/name': 'Alice' } },
          target_account: 'core.onsocial.testnet',
        };
      }
      throw new Error(`unexpected POST to ${path}`);
    });

    await composeAndSign(
      http,
      session,
      'set',
      { path: 'profile/name', value: 'Alice' },
      'social.set',
      { depositYocto: '1' }
    );

    expect(postedBlob).not.toBe('');

    // Decode and assert: outer is a single FunctionCall to core.execute with the
    // expected request body.
    const bytes = Uint8Array.from(atob(postedBlob), (c) => c.charCodeAt(0));
    // Reuse the cursor decoder pattern inline (small + isolates this test).
    let off = 0;
    const u32 = () => {
      const v = new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(
        0,
        true
      );
      off += 4;
      return v;
    };
    const u64 = () => {
      const v = new DataView(
        bytes.buffer,
        bytes.byteOffset + off,
        8
      ).getBigUint64(0, true);
      off += 8;
      return v;
    };
    const u128 = () => {
      const lo = u64();
      const hi = u64();
      return lo + (hi << 64n);
    };
    const str = () => {
      const n = u32();
      const s = new TextDecoder().decode(bytes.subarray(off, off + n));
      off += n;
      return s;
    };
    const sender = str();
    const receiver = str();
    expect(sender).toBe('alice.testnet');
    expect(receiver).toBe('core.onsocial.testnet');
    const actionCount = u32();
    expect(actionCount).toBe(1);
    const disc = bytes[off++];
    expect(disc).toBe(2); // FunctionCall
    const methodName = str();
    expect(methodName).toBe('execute');
    const argsLen = u32();
    const argsJson = new TextDecoder().decode(
      bytes.subarray(off, off + argsLen)
    );
    off += argsLen;
    expect(JSON.parse(argsJson)).toEqual({
      request: {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
      },
    });
    const gas = u64();
    expect(gas).toBe(100n * 1_000_000_000_000n);
    expect(u128()).toBe(1n);
  });
});

// ---------------------------------------------------------------------------
// Broadcast-target routing — verifies opts.broadcast threads correctly
// through composeAndSign / composeFormAndSign / signAndRelay.
// ---------------------------------------------------------------------------

describe('composeAndSign — broadcast routing', () => {
  it('wallet target: skips SessionRequiredError, hands FunctionCall to signer', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
        target_account: 'core.onsocial.testnet',
      },
    });
    const signer = vi.fn(async () => ({ txHash: 'tx_wallet' }));

    const result = await composeAndSign(
      http,
      null, // ← no session
      'set',
      { path: 'profile/name', value: 'Alice' },
      'social.set',
      { broadcast: { kind: 'wallet', signer } }
    );

    expect(result.txHash).toBe('tx_wallet');
    expect(result.ok).toBe(true);
    expect(signer).toHaveBeenCalledWith({
      receiverId: 'core.onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          methodName: 'execute',
          args: {
            request: {
              action: { type: 'set', data: { 'profile/name': 'Alice' } },
            },
          },
          gas: '300000000000000',
          deposit: '0',
        },
      ],
    });
    // Wallet path must not call /relay/delegate.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      '/compose/prepare/set',
      expect.anything()
    );
  });

  it('wallet target: respects gas/deposit overrides and methodName', async () => {
    const http = makeHttp({
      '/compose/prepare/set_permission': {
        action: { type: 'set_permission' },
        target_account: 'core.onsocial.testnet',
      },
    });
    const signer = vi.fn(async () => ({ txHash: 'tx_admin' }));

    await composeAndSign(
      http,
      null,
      'set_permission',
      {},
      'permissions.set_permission',
      {
        broadcast: {
          kind: 'wallet',
          signer,
          gas: '100000000000000',
          deposit: '1',
        },
        methodName: 'execute_admin',
      }
    );

    const firstCall = (
      signer.mock.calls as unknown as [
        { actions: { methodName: string; gas: string; deposit: string }[] },
      ][]
    )[0]!;
    expect(firstCall[0].actions[0]).toMatchObject({
      methodName: 'execute_admin',
      gas: '100000000000000',
      deposit: '1',
    });
  });

  it('wallet target: uses per-call deposit when target does not override it', async () => {
    const http = makeHttp({
      '/compose/prepare/set-confirmed': {
        action: { type: 'set_confirmed' },
        target_account: 'core.onsocial.testnet',
      },
    });
    const signer = vi.fn(async () => ({ txHash: 'tx_wallet' }));

    await composeAndSign(http, null, 'set-confirmed', {}, 'x', {
      broadcast: { kind: 'wallet', signer },
      depositYocto: '100000000000000000000000',
    });

    const firstCall = (
      signer.mock.calls as unknown as [{ actions: { deposit: string }[] }][]
    )[0]!;
    expect(firstCall[0].actions[0]?.deposit).toBe(
      '100000000000000000000000'
    );
  });

  it('relayer target: posts signed_delegate to external URL with X-Api-Key', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set', data: { 'profile/name': 'Alice' } },
        target_account: 'core.onsocial.testnet',
      },
      '/relay/latest-block': { block_height: 12345 },
    });
    const session = makeSession();

    // Mock global fetch (used by the relayer transport).
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ txHash: 'tx_external' }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await composeAndSign(
        http,
        session,
        'set',
        { path: 'profile/name', value: 'Alice' },
        'social.set',
        {
          broadcast: {
            kind: 'relayer',
            url: 'https://relay.example.com/execute_delegate',
            apiKey: 'secret-key',
            headers: { 'X-Custom': 'v1' },
          },
        }
      );

      expect(result).toEqual({ txHash: 'tx_external' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]! as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(url).toBe('https://relay.example.com/execute_delegate');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        'X-Api-Key': 'secret-key',
        'X-Custom': 'v1',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        signed_delegate: 'BASE64_DELEGATE_BLOB',
      });
      // Did NOT hit the gateway /relay/delegate endpoint.
      const postCalls = (http.post as ReturnType<typeof vi.fn>).mock.calls;
      expect(postCalls.some(([p]) => p === '/relay/delegate')).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('relayer target: appends ?wait=true when wait opt is set', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set' },
        target_account: 't.testnet',
      },
      '/relay/latest-block': { block_height: 1 },
    });
    const session = makeSession();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ txHash: 'tx' }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await composeAndSign(http, session, 'set', {}, 'x', {
        broadcast: { kind: 'relayer', url: 'https://r.example.com/foo' },
        wait: true,
      });
      expect((fetchMock.mock.calls as unknown as [string][])[0]![0]).toBe(
        'https://r.example.com/foo?wait=true'
      );

      // Existing query string preserved.
      await composeAndSign(http, session, 'set', {}, 'x', {
        broadcast: { kind: 'relayer', url: 'https://r.example.com/foo?v=2' },
        wait: true,
      });
      expect((fetchMock.mock.calls as unknown as [string][])[1]![0]).toBe(
        'https://r.example.com/foo?v=2&wait=true'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('gateway target: wait=true uses /relay/delegate?wait=true', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set' },
        target_account: 't.testnet',
      },
      '/relay/latest-block': { block_height: 1 },
      '/relay/delegate?wait=true': { txHash: 'tx_wait' },
    });
    const session = makeSession();

    const result = await composeAndSign(http, session, 'set', {}, 'x', {
      wait: true,
    });
    expect(result).toEqual({ txHash: 'tx_wait' });
  });

  it('relayer target: surfaces upstream error', async () => {
    const http = makeHttp({
      '/compose/prepare/set': {
        action: { type: 'set' },
        target_account: 't.testnet',
      },
      '/relay/latest-block': { block_height: 1 },
    });
    const session = makeSession();
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: 'upstream down' }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(
        composeAndSign(http, session, 'set', {}, 'x', {
          broadcast: {
            kind: 'relayer',
            url: 'https://r.example.com/x',
          },
        })
      ).rejects.toThrow(/External relayer .* returned 502/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('composeFormAndSign — broadcast routing', () => {
  function makeHttpWithForm(
    responses: Record<string, unknown>,
    formResponse: unknown
  ): HttpClient {
    return {
      get: vi.fn(async (path: string) => {
        if (!(path in responses)) throw new Error(`unexpected GET to ${path}`);
        return responses[path];
      }),
      post: vi.fn(async (path: string) => {
        if (!(path in responses)) throw new Error(`unexpected POST to ${path}`);
        return responses[path];
      }),
      requestForm: vi.fn(async () => formResponse),
    } as unknown as HttpClient;
  }

  it('default: relays via gateway /relay/delegate and returns media', async () => {
    const http = makeHttpWithForm(
      {
        '/relay/latest-block': { block_height: 99 },
        '/relay/delegate': { txHash: 'tx_form' },
      },
      {
        action: { type: 'mint', data: { title: 'X' } },
        target_account: 'scarces.testnet',
        media: { cid: 'cid1', url: 'u', size: 10, hash: 'h' },
      }
    );
    const session = makeSession();

    const { composeFormAndSign } = await import('./session-bridge.js');
    const result = await composeFormAndSign(
      http,
      session,
      'mint',
      new FormData(),
      'scarces.tokens.mint'
    );

    expect(result.relay).toEqual({ txHash: 'tx_form' });
    expect(result.media).toEqual({
      cid: 'cid1',
      url: 'u',
      size: 10,
      hash: 'h',
    });
  });

  it('wallet target: skips SessionRequiredError and routes to signer', async () => {
    const http = makeHttpWithForm(
      {},
      {
        action: { type: 'mint', data: { title: 'X' } },
        target_account: 'scarces.testnet',
        media: { cid: 'cid1', url: 'u', size: 1, hash: 'h' },
      }
    );
    const signer = vi.fn(async () => ({ txHash: 'tx_wallet_form' }));

    const { composeFormAndSign } = await import('./session-bridge.js');
    const result = await composeFormAndSign(
      http,
      null,
      'mint',
      new FormData(),
      'scarces.tokens.mint',
      { broadcast: { kind: 'wallet', signer } }
    );

    expect((result.relay as { txHash: string }).txHash).toBe('tx_wallet_form');
    expect(signer).toHaveBeenCalledTimes(1);
    expect(result.media?.cid).toBe('cid1');
  });

  it('throws SessionRequiredError when broadcast is gateway and no session', async () => {
    const http = makeHttpWithForm(
      {},
      {
        action: { type: 'mint' },
        target_account: 't.testnet',
      }
    );
    const { composeFormAndSign } = await import('./session-bridge.js');
    await expect(
      composeFormAndSign(http, null, 'mint', new FormData(), 'scarces.mint')
    ).rejects.toBeInstanceOf(SessionRequiredError);
  });
});
