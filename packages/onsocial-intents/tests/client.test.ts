/**
 * Tests for IntentsClient — API interactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntentsClient, createClient } from '../src/client';
import type { QuoteResponse, StatusResponse, Token } from '../src/types';

// ── Mock helpers ────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(data: unknown, ok = true) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── Constructor ─────────────────────────────────────────────────────────────

describe('IntentsClient constructor', () => {
  it('uses defaults', () => {
    const client = new IntentsClient();
    expect(client.getDefaultSlippage()).toBe(100);
    expect(client.getDefaultDeadline()).toBe(3_600_000);
  });

  it('accepts custom config', () => {
    const client = new IntentsClient({
      defaultSlippage: 200,
      defaultDeadline: 60_000,
    });
    expect(client.getDefaultSlippage()).toBe(200);
    expect(client.getDefaultDeadline()).toBe(60_000);
  });
});

describe('createClient', () => {
  it('returns an IntentsClient instance', () => {
    const client = createClient();
    expect(client).toBeInstanceOf(IntentsClient);
  });
});

// ── getTokens ───────────────────────────────────────────────────────────────

describe('IntentsClient.getTokens', () => {
  it('fetches from /v0/tokens', async () => {
    const tokens: Token[] = [
      { assetId: 'nep141:wrap.near', decimals: 24, blockchain: 'near', symbol: 'wNEAR', price: 2.79, priceUpdatedAt: '2025-01-01T00:00:00Z' },
    ];
    mockFetch(tokens);

    const client = new IntentsClient();
    const result = await client.getTokens();
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('wNEAR');
  });

  it('throws on error', async () => {
    mockFetch('Server Error', false);
    const client = new IntentsClient();
    await expect(client.getTokens()).rejects.toThrow('Failed to fetch tokens');
  });
});

// ── getQuote ────────────────────────────────────────────────────────────────

describe('IntentsClient.getQuote', () => {
  it('sends POST to /v0/quote', async () => {
    const quoteResponse: QuoteResponse = {
      correlationId: 'test-id',
      timestamp: '2025-01-01T00:00:00Z',
      signature: 'sig',
      quoteRequest: {} as any,
      quote: {
        amountIn: '1000000',
        amountInFormatted: '1',
        amountInUsd: '1',
        minAmountIn: '995000',
        amountOut: '9950000',
        amountOutFormatted: '9.95',
        amountOutUsd: '9.95',
        minAmountOut: '9900000',
        timeEstimate: 120,
      },
    };
    mockFetch(quoteResponse);

    const client = new IntentsClient({ jwtToken: 'test-jwt' });
    const result = await client.getQuote({
      dry: true,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: 'nep141:wrap.near',
      depositType: 'INTENTS',
      destinationAsset: 'nep141:usdc.near',
      amount: '1000000000000000000000000',
      refundTo: 'alice.near',
      refundType: 'INTENTS',
      recipient: 'bob.near',
      recipientType: 'INTENTS',
      deadline: '2025-12-31T00:00:00Z',
    });

    expect(result.correlationId).toBe('test-id');
    expect(result.quote.amountOut).toBe('9950000');

    // Verify auth header
    const call = (fetch as any).mock.calls[0];
    expect(call[1].headers['Authorization']).toBe('Bearer test-jwt');
  });

  it('merges referral and appFees from client config', async () => {
    mockFetch({ correlationId: 'id', timestamp: '', signature: '', quoteRequest: {}, quote: { amountIn: '0', amountInFormatted: '0', amountInUsd: '0', minAmountIn: '0', amountOut: '0', amountOutFormatted: '0', amountOutUsd: '0', minAmountOut: '0', timeEstimate: 0 } });

    const client = new IntentsClient({
      referral: 'onsocial',
      appFees: [{ recipient: 'fees.onsocial.near', fee: 50 }],
    });

    await client.getQuote({
      dry: true,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: 'nep141:wrap.near',
      depositType: 'INTENTS',
      destinationAsset: 'nep141:usdc.near',
      amount: '1000',
      refundTo: 'a.near',
      refundType: 'INTENTS',
      recipient: 'b.near',
      recipientType: 'INTENTS',
      deadline: '2025-12-31T00:00:00Z',
    });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.referral).toBe('onsocial');
    expect(body.appFees).toEqual([{ recipient: 'fees.onsocial.near', fee: 50 }]);
  });

  it('throws on error', async () => {
    mockFetch('Bad Request', false);
    const client = new IntentsClient();
    await expect(
      client.getQuote({
        dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100,
        originAsset: 'a', depositType: 'INTENTS', destinationAsset: 'b',
        amount: '1', refundTo: 'x', refundType: 'INTENTS',
        recipient: 'y', recipientType: 'INTENTS', deadline: '2025-01-01T00:00:00Z',
      }),
    ).rejects.toThrow('Failed to get quote');
  });
});

// ── submitDeposit ───────────────────────────────────────────────────────────

describe('IntentsClient.submitDeposit', () => {
  it('sends POST to /v0/deposit/submit', async () => {
    mockFetch({ correlationId: 'id', status: 'KNOWN_DEPOSIT_TX' });

    const client = new IntentsClient();
    const result = await client.submitDeposit({
      depositAddress: '0xabc',
      txHash: '0x123',
    });

    expect(result.correlationId).toBe('id');
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('/v0/deposit/submit');
    expect(call[1].method).toBe('POST');
  });
});

// ── getStatus ───────────────────────────────────────────────────────────────

describe('IntentsClient.getStatus', () => {
  it('sends GET to /v0/status with depositAddress', async () => {
    const statusResponse: Partial<StatusResponse> = {
      correlationId: 'id',
      status: 'PROCESSING',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    mockFetch(statusResponse);

    const client = new IntentsClient();
    const result = await client.getStatus('0xabc');

    expect(result.status).toBe('PROCESSING');
    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('depositAddress=0xabc');
  });

  it('includes depositMemo when provided', async () => {
    mockFetch({ status: 'SUCCESS' });

    const client = new IntentsClient();
    await client.getStatus('0xabc', '12345');

    const call = (fetch as any).mock.calls[0];
    expect(call[0]).toContain('depositMemo=12345');
  });
});

// ── pollStatus ──────────────────────────────────────────────────────────────

describe('IntentsClient.pollStatus', () => {
  it('returns immediately on terminal status', async () => {
    mockFetch({ status: 'SUCCESS', correlationId: 'id' });

    const client = new IntentsClient();
    const result = await client.pollStatus('0xabc', undefined, 3, 10);
    expect(result.status).toBe('SUCCESS');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('polls until terminal status', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: callCount >= 3 ? 'SUCCESS' : 'PROCESSING',
          correlationId: 'id',
        }),
      });
    }) as unknown as typeof fetch;

    const updates: string[] = [];
    const client = new IntentsClient();
    const result = await client.pollStatus(
      '0xabc',
      (s) => updates.push(s.status),
      10,
      10,
    );

    expect(result.status).toBe('SUCCESS');
    expect(updates).toEqual(['PROCESSING', 'PROCESSING', 'SUCCESS']);
  });

  it('throws on timeout', async () => {
    mockFetch({ status: 'PROCESSING', correlationId: 'id' });

    const client = new IntentsClient();
    await expect(
      client.pollStatus('0xabc', undefined, 2, 10),
    ).rejects.toThrow('Swap status polling timeout');
  });
});

// ── createDeadline ──────────────────────────────────────────────────────────

describe('IntentsClient.createDeadline', () => {
  it('returns ISO string in the future', () => {
    const client = new IntentsClient();
    const deadline = client.createDeadline(60_000);
    const parsed = new Date(deadline).getTime();
    expect(parsed).toBeGreaterThan(Date.now());
    expect(parsed).toBeLessThanOrEqual(Date.now() + 60_000 + 1000);
  });
});
