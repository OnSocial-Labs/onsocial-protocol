import { describe, expect, it } from 'vitest';
import {
  buildDaoBrandingMetadata,
  composeDaoBranding,
  daoEntityKindLabel,
  parseDaoBrandingMetadata,
  resolveDaoEntityKind,
} from '@/features/protocol/dao-branding';
import { daoPath } from '@/lib/app-routes';

describe('dao branding', () => {
  it('parses and rebuilds onsocial metadata without wiping siblings', () => {
    const metadata = buildDaoBrandingMetadata(
      JSON.stringify({ note: 'keep', onsocial: { v: 1, name: 'Old' } }),
      {
        name: 'OnSocial Community',
        description: 'Builders',
        avatar: 'ipfs://avatar',
        banner: 'ipfs://banner',
      }
    );
    const parsed = JSON.parse(metadata) as {
      note: string;
      onsocial: Record<string, unknown>;
    };
    expect(parsed.note).toBe('keep');
    expect(parseDaoBrandingMetadata(metadata)).toEqual({
      v: 1,
      name: 'OnSocial Community',
      description: 'Builders',
      avatar: 'ipfs://avatar',
      banner: 'ipfs://banner',
    });
  });

  it('composes branding preferring profile media when present', () => {
    const branding = composeDaoBranding({
      daoAccountId: 'demo.sputnik-dao.near',
      profile: {
        accountId: 'demo.sputnik-dao.near',
        name: 'Profile Name',
        bio: 'Profile bio',
        avatarUrl: 'https://cdn.example/a.png',
        bannerUrl: 'https://cdn.example/b.png',
        avatarMedia: { kind: 'image', url: 'https://cdn.example/a.png' },
        bannerMedia: { kind: 'image', url: 'https://cdn.example/b.png' },
        links: {},
        tags: [],
        hashtags: [],
        tickers: [],
        mentions: [],
      },
      config: {
        name: 'Config Name',
        purpose: 'Config purpose',
        metadata: JSON.stringify({
          onsocial: {
            v: 1,
            name: 'Meta Name',
            description: 'Meta bio',
            avatar: 'ipfs://meta-a',
          },
        }),
      },
    });
    expect(branding.source).toBe('profile');
    expect(branding.name).toBe('Profile Name');
    expect(branding.avatarUrl).toBe('https://cdn.example/a.png');
    expect(branding.avatar).toBe('ipfs://meta-a');
    expect(branding.kind).toBe('community');
  });

  it('falls back to sputnik config and labels kinds', () => {
    const branding = composeDaoBranding({
      daoAccountId: 'orphan.sputnik-dao.near',
      profile: null,
      config: {
        name: 'Orphan DAO',
        purpose: 'Purpose line',
        metadata: '',
      },
    });
    expect(branding.source).toBe('config');
    expect(branding.name).toBe('Orphan DAO');
    expect(branding.description).toBe('Purpose line');
    expect(daoEntityKindLabel(branding.kind)).toBe('Community DAO');
  });

  it('builds dao portfolio paths', () => {
    expect(daoPath('Demo.Sputnik-Dao.Near')).toBe(
      '/dao/demo.sputnik-dao.near'
    );
    expect(resolveDaoEntityKind('orphan.sputnik-dao.near')).toBe('community');
  });
});
