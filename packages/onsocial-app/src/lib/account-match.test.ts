import { describe, expect, it } from 'vitest';
import { accountIdsEqual, canonicalAccountId } from './account-match';

describe('canonicalAccountId', () => {
  it('adds .testnet for bare names on testnet', () => {
    expect(canonicalAccountId('alice', 'testnet')).toBe('alice.testnet');
  });

  it('preserves explicit suffixes', () => {
    expect(canonicalAccountId('alice.testnet', 'testnet')).toBe('alice.testnet');
    expect(canonicalAccountId('app.alice.near', 'mainnet')).toBe('app.alice.near');
  });
});

describe('accountIdsEqual', () => {
  it('matches bare and suffixed testnet ids', () => {
    expect(accountIdsEqual('greenghost', 'greenghost.testnet', 'testnet')).toBe(
      true
    );
  });

  it('does not match different accounts', () => {
    expect(accountIdsEqual('alice.testnet', 'bob.testnet', 'testnet')).toBe(
      false
    );
  });
});
