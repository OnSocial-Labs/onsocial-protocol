import { describe, expect, it, vi } from 'vitest';
import { OnSocial } from './client.js';

/** Stub fetch that captures the request and returns a canned response. */
function stubFetch(response: unknown = { txHash: 'tx123' }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  });
}

describe('OnSocial.execute', () => {
  it('posts to /relay/execute with action', async () => {
    const fetch = stubFetch();
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.execute({ type: 'create_group', group_id: 'dao', config: {} });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/relay/execute');
    const body = JSON.parse(opts.body);
    expect(body.action).toEqual({
      type: 'create_group',
      group_id: 'dao',
      config: {},
    });
    // No target_account or options when not specified
    expect(body.target_account).toBeUndefined();
    expect(body.options).toBeUndefined();
  });

  it('passes targetAccount and options when provided', async () => {
    const fetch = stubFetch();
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.execute(
      { type: 'set', data: { 'profile/name': 'Alice' } },
      { targetAccount: 'alice.near', options: { refund_unused_deposit: true } },
    );

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.target_account).toBe('alice.near');
    expect(body.options).toEqual({ refund_unused_deposit: true });
  });

  it('returns RelayResponse', async () => {
    const fetch = stubFetch({ txHash: 'abc123' });
    const os = new OnSocial({ fetch, apiKey: 'key' });

    const res = await os.execute({ type: 'join_group', group_id: 'dao' });
    expect(res.txHash).toBe('abc123');
  });
});

describe('OnSocial.submit', () => {
  it('posts to /relay/signed with action + signed auth', async () => {
    const fetch = stubFetch();
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.submit(
      { type: 'set', data: { 'post/1': { text: 'gm' } } },
      {
        targetAccount: 'alice.near',
        auth: {
          type: 'signed_payload',
          public_key: 'ed25519:abc',
          nonce: '1',
          expires_at_ms: '9999999999999',
          signature: 'base64sig',
        },
      },
    );

    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('/relay/signed');
    const body = JSON.parse(opts.body);
    expect(body.target_account).toBe('alice.near');
    expect(body.action.type).toBe('set');
    expect(body.auth.type).toBe('signed_payload');
    expect(body.auth.public_key).toBe('ed25519:abc');
    expect(body.auth.signature).toBe('base64sig');
  });

  it('passes options when provided', async () => {
    const fetch = stubFetch();
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.submit(
      { type: 'quick_mint', metadata: {} },
      {
        targetAccount: 'alice.near',
        auth: {
          type: 'signed_payload',
          public_key: 'ed25519:abc',
          nonce: '1',
          expires_at_ms: '9999999999999',
          signature: 'sig',
        },
        options: { refund_unused_deposit: true },
      },
    );

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.options).toEqual({ refund_unused_deposit: true });
  });
});

describe('OnSocial.mintPost', () => {
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
      { requested_key: 'post/123', full_key: 'alice.near/post/123', value: '{"text":"gm onchain","v":1}', deleted: false, corrupted: false },
      // mint response
      { txHash: 'token42' },
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });

    const result = await os.mintPost('alice.near', '123');

    // First call: getOne to read the post
    expect(fetch.mock.calls[0][0]).toContain('/data/get-one');

    // Second call: mint
    expect(fetch.mock.calls[1][0]).toContain('/compose/mint');
    const form = fetch.mock.calls[1][1].body as FormData;
    expect(form.get('title')).toBe('gm onchain');
    expect(form.get('description')).toBe('gm onchain');
    const extra = JSON.parse(form.get('extra') as string);
    expect(extra.postAuthor).toBe('alice.near');
    expect(extra.postId).toBe('123');
    expect(extra.postPath).toBe('alice.near/post/123');

    expect(result.mint.txHash).toBe('token42');
    expect(result.listing).toBeUndefined();
  });

  it('lists immediately when priceNear is set', async () => {
    const fetch = multiFetch(
      { requested_key: 'post/p1', full_key: 'a.near/post/p1', value: '{"text":"sell this"}', deleted: false, corrupted: false },
      { txHash: 'token99' },
      { txHash: 'listing-tx' },
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });

    const result = await os.mintPost('a.near', 'p1', {
      priceNear: '5',
      royalty: { 'a.near': 1000 },
      copies: 10,
    });

    // Three calls: getOne, mint, list
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toContain('/compose/list-native-scarce');

    expect(result.mint.txHash).toBe('token99');
    expect(result.listing?.txHash).toBe('listing-tx');
  });

  it('truncates long post text to 100 chars for title', async () => {
    const longText = 'a'.repeat(200);
    const fetch = multiFetch(
      { requested_key: 'post/p1', full_key: 'a.near/post/p1', value: JSON.stringify({ text: longText }), deleted: false, corrupted: false },
      { txHash: 'tok1' },
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.mintPost('a.near', 'p1');

    const form = fetch.mock.calls[1][1].body as FormData;
    const title = form.get('title') as string;
    expect(title.length).toBe(100);
    expect(title.endsWith('...')).toBe(true);
    // Description keeps the full text
    expect(form.get('description')).toBe(longText);
  });

  it('allows title override', async () => {
    const fetch = multiFetch(
      { requested_key: 'post/p1', full_key: 'a.near/post/p1', value: '{"text":"original"}', deleted: false, corrupted: false },
      { txHash: 'tok1' },
    );
    const os = new OnSocial({ fetch, apiKey: 'key' });

    await os.mintPost('a.near', 'p1', { title: 'Custom Title' });

    const form = fetch.mock.calls[1][1].body as FormData;
    expect(form.get('title')).toBe('Custom Title');
  });
});
