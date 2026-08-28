import { describe, expect, it, vi } from 'vitest';
import type { OnSocial } from '@onsocial/sdk';
import {
  fetchCircleFeedPage,
  fetchPulseFeedPage,
  isHomeFeedSocialLens,
} from '@/features/home/home-feed-pulse';

function mockFeedClient(overrides: {
  fromAccounts?: ReturnType<typeof vi.fn>;
  pulse?: ReturnType<typeof vi.fn>;
}): OnSocial {
  return {
    query: {
      feed: {
        fromAccounts:
          overrides.fromAccounts ?? vi.fn().mockResolvedValue({ items: [] }),
        pulse: overrides.pulse ?? vi.fn().mockResolvedValue({ items: [] }),
      },
    },
  } as unknown as OnSocial;
}

describe('home-feed-pulse', () => {
  it('treats pulse and circle as social graph lenses', () => {
    expect(isHomeFeedSocialLens('pulse')).toBe(true);
    expect(isHomeFeedSocialLens('circle')).toBe(true);
    expect(isHomeFeedSocialLens('global')).toBe(false);
    expect(isHomeFeedSocialLens('saved')).toBe(false);
  });

  it('loads Circle as native-only fromAccounts', async () => {
    const fromAccounts = vi.fn().mockResolvedValue({ items: [] });
    const client = mockFeedClient({ fromAccounts });
    await fetchCircleFeedPage(client, ['alice.near'], { limit: 24 });
    expect(fromAccounts).toHaveBeenCalledWith({
      accounts: ['alice.near'],
      limit: 24,
      offset: undefined,
      sort: undefined,
      nativeOnly: true,
    });
  });

  it('loads Pulse from feed.pulse, not Circle', async () => {
    const pulse = vi.fn().mockResolvedValue({ items: [] });
    const fromAccounts = vi.fn();
    const client = mockFeedClient({ pulse, fromAccounts });
    await fetchPulseFeedPage(client, ['alice.near'], {
      limit: 24,
      sort: 'hot',
    });
    expect(pulse).toHaveBeenCalledWith({
      accounts: ['alice.near'],
      limit: 24,
      offset: undefined,
      sort: 'hot',
    });
    expect(fromAccounts).not.toHaveBeenCalled();
  });
});
