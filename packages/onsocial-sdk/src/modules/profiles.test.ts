import { describe, expect, it, vi } from 'vitest';
import { ProfilesModule } from './profiles.js';
import type { SocialModule } from '../social.js';
import type { QueryModule } from '../query/index.js';
import type { StorageProvider } from '../storage/provider.js';

function makeStorage(): StorageProvider {
  return {
    upload: vi.fn(),
    uploadJson: vi.fn(),
    url: (cid: string) => `https://gateway.example/ipfs/${cid}`,
  } as unknown as StorageProvider;
}

function makeQuery(rows: unknown[]): QueryModule {
  return {
    graphql: vi.fn(async () => ({ data: { profilesCurrent: rows } })),
  } as unknown as QueryModule;
}

function makeSocial() {
  const setProfile = vi.fn().mockResolvedValue({ txHash: 'tx' });
  return {
    spy: setProfile,
    mod: { setProfile } as unknown as SocialModule,
  };
}

describe('ProfilesModule.update', () => {
  it('delegates to social.setProfile (no resolution here — social handles file uploads)', async () => {
    const { mod, spy } = makeSocial();
    const profiles = new ProfilesModule(mod, makeQuery([]), makeStorage());
    await profiles.update({ name: 'Alice', bio: 'Builder' });
    expect(spy).toHaveBeenCalledWith({ name: 'Alice', bio: 'Builder' });
  });
});

describe('ProfilesModule.get', () => {
  it('returns null when no rows', async () => {
    const profiles = new ProfilesModule(
      makeSocial().mod,
      makeQuery([]),
      makeStorage()
    );
    expect(await profiles.get('nobody.near')).toBeNull();
  });

  it('materialises reserved fields and parses links + tags JSON', async () => {
    const rows = [
      {
        accountId: 'a.near',
        field: 'v',
        value: '1',
        blockHeight: 100,
        blockTimestamp: 1000,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'name',
        value: 'Alice',
        blockHeight: 110,
        blockTimestamp: 1100,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'bio',
        value: 'Builder',
        blockHeight: 120,
        blockTimestamp: 1200,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'avatar',
        value: 'ipfs://bafyAvatar',
        blockHeight: 105,
        blockTimestamp: 1050,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'banner',
        value: 'ipfs://bafyBanner',
        blockHeight: 106,
        blockTimestamp: 1060,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'links',
        value: '{"twitter":"@alice","github":"alice"}',
        blockHeight: 130,
        blockTimestamp: 1300,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'tags',
        value: '["near","rust"]',
        blockHeight: 115,
        blockTimestamp: 1150,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'pronouns',
        value: 'they/them',
        blockHeight: 90,
        blockTimestamp: 900,
        operation: 'set',
      },
    ];
    const profiles = new ProfilesModule(
      makeSocial().mod,
      makeQuery(rows),
      makeStorage()
    );
    const p = await profiles.get('a.near');
    expect(p).toEqual({
      accountId: 'a.near',
      v: 1,
      name: 'Alice',
      bio: 'Builder',
      avatar: 'ipfs://bafyAvatar',
      banner: 'ipfs://bafyBanner',
      links: { twitter: '@alice', github: 'alice' },
      tags: ['near', 'rust'],
      lastUpdatedHeight: 130,
      lastUpdatedAt: 1300,
      extra: { pronouns: 'they/them' },
    });
  });

  it('skips delete operations', async () => {
    const rows = [
      {
        accountId: 'a.near',
        field: 'name',
        value: 'Alice',
        blockHeight: 100,
        blockTimestamp: 1000,
        operation: 'set',
      },
      {
        accountId: 'a.near',
        field: 'bio',
        value: '',
        blockHeight: 110,
        blockTimestamp: 1100,
        operation: 'delete',
      },
    ];
    const p = await new ProfilesModule(
      makeSocial().mod,
      makeQuery(rows),
      makeStorage()
    ).get('a.near');
    expect(p).not.toBeNull();
    expect(p!.name).toBe('Alice');
    expect(p!.bio).toBeUndefined();
  });

  it('falls back to extra when links is invalid JSON', async () => {
    const rows = [
      {
        accountId: 'a.near',
        field: 'links',
        value: 'not json',
        blockHeight: 100,
        blockTimestamp: 1000,
        operation: 'set',
      },
    ];
    const p = await new ProfilesModule(
      makeSocial().mod,
      makeQuery(rows),
      makeStorage()
    ).get('a.near');
    expect(p!.links).toBeUndefined();
    expect(p!.extra.links).toBe('not json');
  });
});

describe('ProfilesModule.getMany', () => {
  it('fetches profiles in parallel and skips missing accounts', async () => {
    const rowsByAccount: Record<string, unknown[]> = {
      'a.near': [
        {
          accountId: 'a.near',
          field: 'name',
          value: 'Alice',
          blockHeight: 1,
          blockTimestamp: 1,
          operation: 'set',
        },
      ],
      'b.near': [],
      'c.near': [
        {
          accountId: 'c.near',
          field: 'name',
          value: 'Carol',
          blockHeight: 1,
          blockTimestamp: 1,
          operation: 'set',
        },
      ],
    };
    const query = {
      graphql: vi.fn(async (_q: { variables?: { id?: string } }) => ({
        data: { profilesCurrent: rowsByAccount[_q.variables?.id ?? ''] ?? [] },
      })),
    } as unknown as QueryModule;
    const profiles = new ProfilesModule(makeSocial().mod, query, makeStorage());
    const out = await profiles.getMany(['a.near', 'b.near', 'c.near']);
    expect(Object.keys(out).sort()).toEqual(['a.near', 'c.near']);
    expect(out['a.near'].name).toBe('Alice');
    expect(out['c.near'].name).toBe('Carol');
  });
});

describe('ProfilesModule.avatarUrl / bannerUrl', () => {
  const profiles = new ProfilesModule(
    makeSocial().mod,
    makeQuery([]),
    makeStorage()
  );

  it('rewrites ipfs:// to gateway URL via StorageProvider.url', () => {
    const p = {
      accountId: 'a.near',
      avatar: 'ipfs://bafyAvatar',
      banner: 'ipfs://bafyBanner',
      extra: {},
    };
    expect(profiles.avatarUrl(p)).toBe(
      'https://gateway.example/ipfs/bafyAvatar'
    );
    expect(profiles.bannerUrl(p)).toBe(
      'https://gateway.example/ipfs/bafyBanner'
    );
  });

  it('passes through https:// URLs unchanged', () => {
    expect(
      profiles.avatarUrl({
        accountId: 'a.near',
        avatar: 'https://cdn.example/me.jpg',
        extra: {},
      })
    ).toBe('https://cdn.example/me.jpg');
  });

  it('returns null when avatar/banner missing or profile null', () => {
    expect(profiles.avatarUrl(null)).toBeNull();
    expect(profiles.bannerUrl(undefined)).toBeNull();
    expect(profiles.avatarUrl({ accountId: 'a.near', extra: {} })).toBeNull();
  });
});
