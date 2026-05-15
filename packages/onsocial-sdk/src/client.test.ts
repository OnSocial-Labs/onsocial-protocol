import { describe, expect, it, beforeEach, vi } from 'vitest';
import { OnSocial } from './client.js';
import { __resetLatestBlockCache } from './internal/session-bridge.js';
import { SessionRequiredError } from './internal/session-bridge.js';

beforeEach(() => {
  __resetLatestBlockCache();
});

/** Stub fetch that captures the request and returns a canned response. */
function stubFetch(response: unknown = { txHash: 'tx123' }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  });
}

/**
 * Multi-response fetch keyed by URL substring. Useful for delegate flows
 * that hit `/relay/latest-block` then `/relay/delegate`.
 */
function routedFetch(routes: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    const matched = Object.entries(routes).find(([key]) => url.includes(key));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(matched ? matched[1] : { txHash: 'default' }),
    });
  });
}

function fakeSession(
  capture?: Array<{
    action: Record<string, unknown>;
    targetContract: string;
    targetAccount?: string;
    requestOptions?: Record<string, unknown>;
    depositYocto?: string;
  }>
) {
  return {
    supportsAttachedDeposit: true,
    signComposeDelegate: vi.fn(
      async (args: {
        action: Record<string, unknown>;
        targetContract?: string;
        targetAccount?: string;
        requestOptions?: Record<string, unknown>;
        depositYocto?: string | bigint;
      }) => {
        capture?.push({
          action: args.action,
          targetContract: args.targetContract ?? '',
          ...(args.targetAccount !== undefined && {
            targetAccount: args.targetAccount,
          }),
          ...(args.requestOptions !== undefined && {
            requestOptions: args.requestOptions,
          }),
          ...(args.depositYocto !== undefined && {
            depositYocto: String(args.depositYocto),
          }),
        });
        return { base64: 'BASE64_DELEGATE_BLOB', nonce: 1 };
      }
    ),
  } as never;
}

describe('OnSocial.execute', () => {
  it('throws SessionRequiredError when no session is attached', async () => {
    const fetch = stubFetch();
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await expect(
      os.execute({ type: 'create_group', group_id: 'dao', config: {} })
    ).rejects.toBeInstanceOf(SessionRequiredError);
  });

  it('signs the action and POSTs the SignedDelegateAction to /relay/delegate', async () => {
    const fetch = routedFetch({
      '/relay/latest-block': { block_height: 100 },
      '/relay/delegate': { txHash: 'tx123' },
    });
    const os = new OnSocial({ fetch, apiKey: 'key', network: 'mainnet' });
    const captured: Array<{
      action: Record<string, unknown>;
      targetContract: string;
    }> = [];
    os.attachSession(fakeSession(captured));

    await os.execute({ type: 'create_group', group_id: 'dao', config: {} });

    expect(captured).toEqual([
      {
        action: { type: 'create_group', group_id: 'dao', config: {} },
        targetContract: 'core.onsocial.near',
      },
    ]);
    const delegateCall = fetch.mock.calls.find((c) =>
      String(c[0]).includes('/relay/delegate')
    );
    expect(delegateCall).toBeDefined();
    const body = JSON.parse(delegateCall![1].body);
    expect(body).toEqual({ signed_delegate: 'BASE64_DELEGATE_BLOB' });
  });

  it('passes targetAccount, targetContract and options through to signComposeDelegate', async () => {
    const fetch = routedFetch({
      '/relay/latest-block': { block_height: 100 },
      '/relay/delegate': { txHash: 'tx-x' },
    });
    const os = new OnSocial({ fetch, apiKey: 'key', network: 'mainnet' });
    const captured: Array<{
      action: Record<string, unknown>;
      targetContract: string;
      targetAccount?: string;
      requestOptions?: Record<string, unknown>;
      depositYocto?: string;
    }> = [];
    os.attachSession(fakeSession(captured));

    await os.execute(
      { type: 'set', data: { 'profile/name': 'Alice' } },
      {
        targetAccount: 'alice.near',
        targetContract: 'core.onsocial.testnet',
        options: { refund_unused_deposit: true },
        depositYocto: '1',
      }
    );

    expect(captured[0]).toEqual({
      action: { type: 'set', data: { 'profile/name': 'Alice' } },
      targetContract: 'core.onsocial.testnet',
      targetAccount: 'alice.near',
      requestOptions: { refund_unused_deposit: true },
      depositYocto: '1',
    });
  });

  it('uses the wait=true endpoint when opts.wait is set', async () => {
    const fetch = routedFetch({
      '/relay/latest-block': { block_height: 100 },
      '/relay/delegate': { txHash: 'tx-w' },
    });
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    await os.execute({ type: 'noop' }, { wait: true });

    const delegateCall = fetch.mock.calls.find((c) =>
      String(c[0]).includes('/relay/delegate')
    );
    expect(String(delegateCall![0])).toContain('/relay/delegate?wait=true');
  });

  it('returns RelayResponse', async () => {
    const fetch = routedFetch({
      '/relay/latest-block': { block_height: 100 },
      '/relay/delegate': { txHash: 'abc123' },
    });
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    const res = await os.execute({ type: 'join_group', group_id: 'dao' });
    expect(res.txHash).toBe('abc123');
  });

  describe('broadcast override', () => {
    it('posts to an external relayer URL when broadcast.kind === "relayer"', async () => {
      const httpFetch = routedFetch({
        '/relay/latest-block': { block_height: 100 },
      });
      const externalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ txHash: 'tx-ext-1' }),
      });
      vi.stubGlobal('fetch', externalFetch);
      try {
        const os = new OnSocial({ fetch: httpFetch, apiKey: 'key' });
        os.attachSession(fakeSession());

        const res = await os.execute(
          { type: 'noop' },
          {
            broadcast: {
              kind: 'relayer',
              url: 'https://relay.example.com/execute_delegate',
              apiKey: 'svc-secret',
              headers: { 'X-Trace': 'test' },
            },
          }
        );

        expect(externalFetch).toHaveBeenCalledOnce();
        const [url, init] = externalFetch.mock.calls[0];
        expect(url).toBe('https://relay.example.com/execute_delegate');
        expect(init.method).toBe('POST');
        expect(init.headers['X-Api-Key']).toBe('svc-secret');
        expect(init.headers['X-Trace']).toBe('test');
        expect(JSON.parse(init.body)).toEqual({
          signed_delegate: 'BASE64_DELEGATE_BLOB',
        });
        expect(res.txHash).toBe('tx-ext-1');
        expect(
          httpFetch.mock.calls.some((c) =>
            String(c[0]).includes('/relay/delegate')
          )
        ).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('appends ?wait=true to external relayer URL when wait is set', async () => {
      const httpFetch = routedFetch({
        '/relay/latest-block': { block_height: 100 },
      });
      const externalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ txHash: 'tx-w' }),
      });
      vi.stubGlobal('fetch', externalFetch);
      try {
        const os = new OnSocial({ fetch: httpFetch, apiKey: 'key' });
        os.attachSession(fakeSession());

        await os.execute(
          { type: 'noop' },
          {
            wait: true,
            broadcast: {
              kind: 'relayer',
              url: 'https://relay.example.com/execute_delegate',
            },
          }
        );

        const [url] = externalFetch.mock.calls[0];
        expect(String(url)).toBe(
          'https://relay.example.com/execute_delegate?wait=true'
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('honors OnSocialConfig.defaultBroadcast when no per-call override is given', async () => {
      const httpFetch = routedFetch({
        '/relay/latest-block': { block_height: 100 },
      });
      const externalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ txHash: 'tx-default' }),
      });
      vi.stubGlobal('fetch', externalFetch);
      try {
        const os = new OnSocial({
          fetch: httpFetch,
          apiKey: 'key',
          defaultBroadcast: {
            kind: 'relayer',
            url: 'https://my-relayer/execute_delegate',
          },
        });
        os.attachSession(fakeSession());

        await os.execute({ type: 'noop' });

        expect(externalFetch).toHaveBeenCalledOnce();
        expect(String(externalFetch.mock.calls[0][0])).toBe(
          'https://my-relayer/execute_delegate'
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('throws when external relayer returns a non-2xx response', async () => {
      const httpFetch = routedFetch({
        '/relay/latest-block': { block_height: 100 },
      });
      const externalFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ error: 'upstream down' }),
      });
      vi.stubGlobal('fetch', externalFetch);
      try {
        const os = new OnSocial({ fetch: httpFetch, apiKey: 'key' });
        os.attachSession(fakeSession());

        await expect(
          os.execute(
            { type: 'noop' },
            {
              broadcast: {
                kind: 'relayer',
                url: 'https://relay.example.com/execute_delegate',
              },
            }
          )
        ).rejects.toThrow(/502/);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('wallet broadcast (user pays gas, no relayer)', () => {
    it('hands a FunctionCall to the wallet signer with no session attached', async () => {
      const httpFetch = stubFetch();
      const signer = vi.fn().mockResolvedValue({ txHash: 'tx-wallet-1' });
      const os = new OnSocial({ fetch: httpFetch, network: 'mainnet' });
      // No attachSession() — wallet mode does not need one.

      const res = await os.execute(
        { type: 'set', data: { 'profile/name': 'Alice' } },
        {
          broadcast: { kind: 'wallet', signer },
          targetAccount: 'alice.near',
          options: { refund_unused_deposit: true },
        }
      );

      expect(signer).toHaveBeenCalledOnce();
      const arg = signer.mock.calls[0][0];
      expect(arg.receiverId).toBe('core.onsocial.near');
      expect(arg.actions).toHaveLength(1);
      expect(arg.actions[0]).toMatchObject({
        type: 'FunctionCall',
        methodName: 'execute',
        gas: '300000000000000',
        deposit: '0',
      });
      expect(arg.actions[0].args).toEqual({
        request: {
          action: { type: 'set', data: { 'profile/name': 'Alice' } },
          target_account: 'alice.near',
          options: { refund_unused_deposit: true },
        },
      });
      // Did NOT touch the gateway at all.
      expect(httpFetch).not.toHaveBeenCalled();
      expect(res.txHash).toBe('tx-wallet-1');
      expect(res.ok).toBe(true);
    });

    it('omits target_account when not specified (contract defaults to predecessor)', async () => {
      const signer = vi.fn().mockResolvedValue({ txHash: 'tx-w2' });
      const os = new OnSocial({ fetch: stubFetch(), network: 'mainnet' });

      await os.execute(
        { type: 'noop' },
        { broadcast: { kind: 'wallet', signer } }
      );

      const arg = signer.mock.calls[0][0];
      expect(arg.actions[0].args.request).toEqual({
        action: { type: 'noop' },
      });
      expect(arg.actions[0].args.request.target_account).toBeUndefined();
      expect(arg.actions[0].args.request.options).toBeUndefined();
    });

    it('honors custom gas and deposit overrides', async () => {
      const signer = vi.fn().mockResolvedValue({ txHash: 'tx-w3' });
      const os = new OnSocial({ fetch: stubFetch(), network: 'mainnet' });

      await os.execute(
        { type: 'noop' },
        {
          broadcast: {
            kind: 'wallet',
            signer,
            gas: '50000000000000',
            deposit: '1000000000000000000000000',
          },
        }
      );

      expect(signer.mock.calls[0][0].actions[0]).toMatchObject({
        gas: '50000000000000',
        deposit: '1000000000000000000000000',
      });
    });

    it('extracts txHash from `transaction.hash` shape (wallet-selector compat)', async () => {
      const signer = vi
        .fn()
        .mockResolvedValue({ transaction: { hash: 'tx-ws-1' } });
      const os = new OnSocial({ fetch: stubFetch(), network: 'mainnet' });

      const res = await os.execute(
        { type: 'noop' },
        { broadcast: { kind: 'wallet', signer } }
      );

      expect(res.txHash).toBe('tx-ws-1');
    });
  });

  describe('custom latestBlockHeightProvider', () => {
    it('uses the injected provider instead of /relay/latest-block', async () => {
      const httpFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ txHash: 'tx-p' }),
      });
      const provider = vi.fn().mockResolvedValue(42_000_000);
      const os = new OnSocial({
        fetch: httpFetch,
        apiKey: 'key',
        latestBlockHeightProvider: provider,
      });
      os.attachSession(fakeSession());

      await os.execute({ type: 'noop' });

      expect(provider).toHaveBeenCalledOnce();
      // No call to /relay/latest-block.
      expect(
        httpFetch.mock.calls.some((c) =>
          String(c[0]).includes('/relay/latest-block')
        )
      ).toBe(false);
      // But the gateway delegate POST still happened.
      expect(
        httpFetch.mock.calls.some((c) =>
          String(c[0]).includes('/relay/delegate')
        )
      ).toBe(true);
    });
  });
});

describe('OnSocial.mintPost', () => {
  /** Minimal fake Session used to satisfy the SessionGetter check on FormData upload routes. */
  function fakeSession() {
    return {
      signComposeDelegate: vi.fn(async () => ({
        base64: 'BASE64_DELEGATE_BLOB',
        nonce: 1,
      })),
    } as never;
  }

  /** Multi-response fetch: first call returns post data, second returns mint, third returns listing. */
  function multiFetch(...responses: unknown[]) {
    let callIndex = 0;
    return vi.fn().mockImplementation(() => {
      const res = responses[callIndex] ?? { txHash: 'default' };
      callIndex++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(res),
      });
    });
  }

  it('reads post, mints with post metadata in extra', async () => {
    const fetch = multiFetch(
      // getOne response (post content)
      {
        requested_key: 'post/123',
        full_key: 'alice.near/post/123',
        value: JSON.stringify({
          text: 'gm onchain',
          v: 1,
          media: [{ cid: 'bafy-post-media', mime: 'image/png', size: 70 }],
        }),
        deleted: false,
        corrupted: false,
      },
      // /compose/prepare/mint response
      {
        action: { type: 'quick_mint', metadata: {} },
        target_account: 'scarces.onsocial.near',
      },
      // /relay/latest-block (GET)
      { block_height: 100 },
      // /relay/delegate response
      { txHash: 'token42' }
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    const result = await os.mintPost('alice.near', '123');

    // First call: getOne to read the post
    expect(fetch.mock.calls[0][0]).toContain('/data/get-one');

    // Second call: prepare/mint (multipart)
    expect(fetch.mock.calls[1][0]).toContain('/compose/prepare/mint');
    const form = fetch.mock.calls[1][1].body as FormData;
    expect(form.get('title')).toBe('gm onchain');
    expect(form.get('description')).toBeNull();
    expect(form.get('mediaCid')).toBe('bafy-post-media');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.sourcePost).toEqual({
      author: 'alice.near',
      postId: '123',
      path: 'alice.near/post/123',
    });

    // Third call: /relay/latest-block; Fourth call: /relay/delegate
    expect(fetch.mock.calls[2][0]).toContain('/relay/latest-block');
    expect(fetch.mock.calls[3][0]).toContain('/relay/delegate');

    expect(result.mint.txHash).toBe('token42');
    expect(result.listing).toBeUndefined();
  });

  it('lists immediately when priceNear is set', async () => {
    const fetch = multiFetch(
      {
        requested_key: 'post/p1',
        full_key: 'a.near/post/p1',
        value: '{"text":"sell this"}',
        deleted: false,
        corrupted: false,
      },
      // mint: prepare
      {
        action: { type: 'quick_mint', metadata: {} },
        target_account: 'scarces.onsocial.near',
      },
      // mint: /relay/latest-block (GET; cached for list call below)
      { block_height: 100 },
      // mint: /relay/delegate
      { txHash: 'mint-tx', tokenId: 's:999' },
      // list: prepare
      {
        action: { type: 'list_native_scarce', token_id: 'token99' },
        target_account: 'scarces.onsocial.near',
      },
      // list: /relay/delegate (latest-block reused from cache)
      { txHash: 'listing-tx' }
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    const result = await os.mintPost('a.near', 'p1', {
      priceNear: '5',
      royalty: { 'a.near': 1000 },
      copies: 10,
    });

    // Six calls: getOne, prepare/mint, /relay/latest-block, /relay/delegate, prepare/list, /relay/delegate
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls[1][0]).toContain('/compose/prepare/mint');
    expect(fetch.mock.calls[2][0]).toContain('/relay/latest-block');
    expect(fetch.mock.calls[3][0]).toContain('/relay/delegate');
    expect(fetch.mock.calls[4][0]).toContain(
      '/compose/prepare/list-native-scarce'
    );
    expect(JSON.parse(fetch.mock.calls[4][1].body as string).tokenId).toBe(
      's:999'
    );
    expect(fetch.mock.calls[5][0]).toContain('/relay/delegate');

    expect(result.mint.txHash).toBe('mint-tx');
    expect(result.listing?.txHash).toBe('listing-tx');
  });

  it('derives a compact title from long post text', async () => {
    const longText = 'a'.repeat(200);
    const fetch = multiFetch(
      {
        requested_key: 'post/p1',
        full_key: 'a.near/post/p1',
        value: JSON.stringify({ text: longText }),
        deleted: false,
        corrupted: false,
      },
      {
        action: { type: 'quick_mint', metadata: {} },
        target_account: 'scarces.onsocial.near',
      },
      { block_height: 100 },
      { txHash: 'tok1' }
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    await os.mintPost('a.near', 'p1');

    const form = fetch.mock.calls[1][1].body as FormData;
    const title = form.get('title') as string;
    expect(title.length).toBe(80);
    expect(title).toBe('a'.repeat(80));
    // Description keeps the full text
    expect(form.get('description')).toBe(longText);
  });

  it('allows title override', async () => {
    const fetch = multiFetch(
      {
        requested_key: 'post/p1',
        full_key: 'a.near/post/p1',
        value: '{"text":"original"}',
        deleted: false,
        corrupted: false,
      },
      {
        action: { type: 'quick_mint', metadata: {} },
        target_account: 'scarces.onsocial.near',
      },
      { block_height: 100 },
      { txHash: 'tok1' }
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });
    os.attachSession(fakeSession());

    await os.mintPost('a.near', 'p1', { title: 'Custom Title' });

    const form = fetch.mock.calls[1][1].body as FormData;
    expect(form.get('title')).toBe('Custom Title');
  });
});
