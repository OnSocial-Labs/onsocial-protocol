import { describe, expect, it } from 'vitest';
import {
  buildDaoBrandingMetadata,
  composeDaoBranding,
  daoEntityKindLabel,
  decodeDaoConfigMetadata,
  encodeDaoConfigMetadata,
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
    const parsed = JSON.parse(decodeDaoConfigMetadata(metadata)) as {
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
      links: null,
    });
  });

  it('round-trips links in metadata', () => {
    const metadata = buildDaoBrandingMetadata('', {
      name: 'Linked DAO',
      links: { website: 'https://example.com', x: 'dao' },
    });
    expect(parseDaoBrandingMetadata(metadata)?.links).toEqual({
      website: 'https://example.com',
      x: 'dao',
    });
  });

  it('encodes Sputnik metadata as Base64VecU8 and accepts wire on read', () => {
    const plain = JSON.stringify({
      onsocial: { v: 1, name: 'Wire DAO', avatar: 'ipfs://crest' },
    });
    const wire = encodeDaoConfigMetadata(plain);
    expect(wire).not.toContain('{');
    expect(encodeDaoConfigMetadata(wire)).toBe(wire);
    expect(decodeDaoConfigMetadata(wire)).toBe(plain);
    expect(parseDaoBrandingMetadata(wire)).toEqual({
      v: 1,
      name: 'Wire DAO',
      description: null,
      avatar: 'ipfs://crest',
      banner: null,
      links: null,
    });
    expect(parseDaoBrandingMetadata(plain)?.name).toBe('Wire DAO');
  });

  it('merges into existing base64 wire metadata without wiping siblings', () => {
    const existing = encodeDaoConfigMetadata(
      JSON.stringify({
        flagLogo: 'ipfs://astro',
        onsocial: { v: 1, name: 'Old' },
      })
    );
    const next = buildDaoBrandingMetadata(existing, { name: 'New' });
    const root = JSON.parse(decodeDaoConfigMetadata(next)) as {
      flagLogo: string;
      onsocial: { name: string };
    };
    expect(root.flagLogo).toBe('ipfs://astro');
    expect(root.onsocial.name).toBe('New');
  });

  it('composes branding preferring profile media when present', () => {
    const branding = composeDaoBranding({
      daoAccountId: 'demo.sputnik-dao.near',
      profile: {
        accountId: 'demo.sputnik-dao.near',
        name: 'Profile Name',
        location: null,
        kind: null,
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

  it('falls back to sputnik purpose when profile bio is blank whitespace', () => {
    const branding = composeDaoBranding({
      daoAccountId: 'demo.sputnik-dao.near',
      profile: {
        accountId: 'demo.sputnik-dao.near',
        name: null,
        location: null,
        kind: null,
        bio: '   ',
        avatarUrl: 'https://cdn.example/a.png',
        bannerUrl: null,
        avatarMedia: { kind: 'image', url: 'https://cdn.example/a.png' },
        bannerMedia: null,
        links: {},
        tags: [],
        hashtags: [],
        tickers: [],
        mentions: [],
      },
      config: {
        name: 'Config Name',
        purpose: 'Purpose line',
        metadata: '',
      },
    });
    expect(branding.description).toBe('Purpose line');
  });

  it('builds dao portfolio paths', () => {
    expect(daoPath('Demo.Sputnik-Dao.Near')).toBe('/@demo.sputnik-dao.near');
    expect(resolveDaoEntityKind('orphan.sputnik-dao.near')).toBe('community');
  });
});
