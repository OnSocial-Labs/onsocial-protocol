import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchEndorsementSupporters,
  invalidateEndorsementSupporters,
} from '@/lib/endorsement-supporters-client';

function stubFetchOnce(payload: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEndorsementSupporters', () => {
  it('shares one in-flight request per endorsement', async () => {
    const fetchMock = stubFetchOnce({
      supporters: [
        {
          accountId: 'carol.testnet',
          name: 'Carol',
          avatarUrl: null,
          totalAmountYocto: '1000000000000000000000000',
          spendCount: 1,
          latestSupportAt: 123,
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      fetchEndorsementSupporters('endorsement-one'),
      fetchEndorsementSupporters('endorsement-one'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/endorsement/supporters?endorsementId=endorsement-one'
    );
    expect(first).toHaveLength(1);
    expect(second[0]?.accountId).toBe('carol.testnet');
  });

  it('refetches after invalidation', async () => {
    const fetchMock = stubFetchOnce({ supporters: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchEndorsementSupporters('endorsement-two');
    invalidateEndorsementSupporters('endorsement-two');
    await fetchEndorsementSupporters('endorsement-two');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures — the next read retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Indexers down' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ supporters: [] }),
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchEndorsementSupporters('endorsement-three')
    ).rejects.toThrow('Indexers down');
    await expect(
      fetchEndorsementSupporters('endorsement-three')
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
