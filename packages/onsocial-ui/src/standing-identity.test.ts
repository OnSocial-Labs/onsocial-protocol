import { describe, expect, it } from 'vitest';
import {
  StandingIdentity,
  standingIdentityAccountCopy,
  standingIdentityLabel,
} from './standing-identity.js';

describe('standingIdentityLabel', () => {
  it('uses @handle as the primary label when no custom name', () => {
    expect(standingIdentityLabel('alice.near')).toEqual({
      name: null,
      label: '@alice.near',
      handle: 'alice.near',
    });
  });

  it('shows custom name and keeps handle separate', () => {
    expect(standingIdentityLabel('alice.near', ' Alice ')).toEqual({
      name: 'Alice',
      label: 'Alice',
      handle: 'alice.near',
    });
  });
});

describe('standingIdentityAccountCopy', () => {
  it('returns quiet @handle for sheet copy', () => {
    expect(standingIdentityAccountCopy('berrysamba.testnet')).toBe(
      '@berrysamba.testnet'
    );
  });

  it('trims and keeps network suffix', () => {
    expect(standingIdentityAccountCopy('  alice.near  ')).toBe('@alice.near');
  });

  it('returns empty for blank account', () => {
    expect(standingIdentityAccountCopy('')).toBe('');
    expect(standingIdentityAccountCopy('   ')).toBe('');
  });
});

describe('StandingIdentity', () => {
  it('exports the identity cluster', () => {
    expect(typeof StandingIdentity).toBe('function');
  });
});
