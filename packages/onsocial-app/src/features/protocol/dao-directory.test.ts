import { describe, expect, it } from 'vitest';
import {
  daoDirectoryEntryFromCatalog,
  daoDirectoryEntryFromMembership,
  resolveDaoDirectoryName,
} from '@/features/protocol/dao-directory';

describe('dao directory entries', () => {
  it('prefers OnSocial metadata name and crest for catalog rows', () => {
    const entry = daoDirectoryEntryFromCatalog({
      daoAccountId: 'demo.sputnikv2.testnet',
      name: 'Config Name',
      purpose: 'Purpose line',
      metadata: JSON.stringify({
        onsocial: {
          v: 1,
          name: 'Crested DAO',
          avatar: 'ipfs://bafyCrest',
        },
      }),
      source: 'factory',
      listedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(entry.name).toBe('Crested DAO');
    expect(entry.subtitle).toBe('Purpose line');
    expect(entry.avatarUrl).toContain('bafyCrest');
    expect(entry.href).toContain('/@demo.sputnikv2.testnet');
  });

  it('uses role labels for My DAOs subtitle', () => {
    const entry = daoDirectoryEntryFromMembership({
      daoAccountId: 'council.sputnikv2.testnet',
      roleNames: ['council', 'member'],
      updatedAt: '2026-01-01T00:00:00.000Z',
      name: 'Council DAO',
      purpose: 'Hidden when roles exist',
      metadata: null,
    });

    expect(entry.name).toBe('Council DAO');
    expect(entry.subtitle.toLowerCase()).toContain('council');
  });

  it('falls back to account id when no names exist', () => {
    expect(resolveDaoDirectoryName('lonely.sputnikv2.testnet')).toBe(
      'lonely.sputnikv2.testnet'
    );
  });
});
