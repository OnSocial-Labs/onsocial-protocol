import { describe, expect, it } from 'vitest';
import {
  ACTIVE_NEAR_NETWORK,
  SPUTNIK_DAO_FACTORY,
} from '@/lib/app-config';
import {
  buildDaoFactoryAccountId,
  buildDaoFactoryInitArgs,
  encodeDaoFactoryInitArgs,
  isValidDaoFactorySlug,
  normalizeDaoFactorySlug,
} from '@/features/protocol/dao-factory-create';

describe('dao-factory-create', () => {
  it('normalizes slugs to a single account segment', () => {
    expect(normalizeDaoFactorySlug('  Cool Guild!  ')).toBe('cool-guild');
    expect(normalizeDaoFactorySlug('a.b.c')).toBe('a-b-c');
    expect(normalizeDaoFactorySlug('---x---')).toBe('x');
  });

  it('builds factory child account ids for the active network', () => {
    expect(buildDaoFactoryAccountId('primitives')).toBe(
      `primitives.${SPUTNIK_DAO_FACTORY}`
    );
    expect(SPUTNIK_DAO_FACTORY).toBe(
      ACTIVE_NEAR_NETWORK === 'mainnet'
        ? 'sputnik-dao.near'
        : 'sputnikv2.testnet'
    );
  });

  it('rejects short or invalid slugs', () => {
    expect(isValidDaoFactorySlug('')).toBe(false);
    expect(isValidDaoFactorySlug('a')).toBe(false);
    expect(isValidDaoFactorySlug('ok')).toBe(true);
  });

  it('encodes init args as base64 JSON for factory create', () => {
    const init = buildDaoFactoryInitArgs({
      displayName: 'Primitives',
      purpose: 'Building on NEAR',
      councilAccountId: 'alice.testnet',
    });
    expect(init.config.name).toBe('Primitives');
    expect(init.config.purpose).toBe('Building on NEAR');
    expect(init.config.metadata).toBe('');
    expect(init.policy).toEqual(['alice.testnet']);

    const encoded = encodeDaoFactoryInitArgs(init);
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64').toString('utf8')
    ) as typeof init;
    expect(decoded).toEqual(init);
  });
});
