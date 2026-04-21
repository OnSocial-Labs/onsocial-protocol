import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http.js';

describe('HttpClient mutation response normalization', () => {
  it('preserves txHash when the backend returns the canonical field', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ txHash: 'abc123' }),
    });
    const http = new HttpClient({ fetch, apiKey: 'key' });

    const result = await http.post<{ txHash?: string; ok?: boolean }>(
      '/relay/execute',
      { action: { type: 'join_group', group_id: 'dao' } }
    );

    expect(result.txHash).toBe('abc123');
    expect(result.ok).toBeUndefined();
  });

  it('maps alternate hash field names onto txHash', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ transaction_hash: 'alt-hash' }),
    });
    const http = new HttpClient({ fetch, apiKey: 'key' });

    const result = await http.post<{ txHash?: string }>('/compose/set', {
      path: 'profile/name',
      value: 'Alice',
    });

    expect(result.txHash).toBe('alt-hash');
  });

  it('marks successful writes ok when no txHash is returned', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'accepted' }),
    });
    const http = new HttpClient({ fetch, apiKey: 'key' });

    const result = await http.post<{
      ok?: boolean;
      status?: string;
      raw?: unknown;
      txHash?: string;
    }>('/relay/execute', {
      action: { type: 'create_group', group_id: 'dao', config: {} },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('accepted');
    expect(result.txHash).toBeUndefined();
    expect(result.raw).toEqual({ status: 'accepted' });
  });

  it('normalizes reward and claim endpoints without txHash', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ claimed: '0' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'credited' }),
      });
    const http = new HttpClient({ fetch, apiKey: 'key' });

    const claim = await http.post<{
      claimed?: string;
      ok?: boolean;
      txHash?: string;
    }>('/v1/claim', { account_id: 'alice.near' });
    const credit = await http.post<{
      status?: string;
      ok?: boolean;
      txHash?: string;
    }>('/v1/reward', { account_id: 'alice.near', amount: '1000' });

    expect(claim.claimed).toBe('0');
    expect(claim.ok).toBe(true);
    expect(claim.txHash).toBeUndefined();

    expect(credit.status).toBe('credited');
    expect(credit.ok).toBe(true);
    expect(credit.txHash).toBeUndefined();
  });

  it('does not normalize non-mutation GET responses', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unread: 5 }),
    });
    const http = new HttpClient({ fetch, apiKey: 'key' });

    const result = await http.get<{ unread: number }>(
      '/developer/notifications/count'
    );

    expect(result).toEqual({ unread: 5 });
  });
});
