import { describe, expect, it } from 'vitest';
import {
  isProtocolNearAccountFieldReady,
  protocolNearAccountFieldIssue,
} from '@/features/protocol/protocol-compose-near-account-field';

describe('protocolNearAccountFieldIssue', () => {
  it('stays quiet while typing or probing', () => {
    expect(protocolNearAccountFieldIssue('idle', 'alice')).toBeNull();
    expect(protocolNearAccountFieldIssue('checking', 'alice.testnet')).toBeNull();
  });

  it('reports invalid format after settle', () => {
    expect(protocolNearAccountFieldIssue('invalid', 'ALICE')).toMatch(/complete/i);
  });

  it('requires on-chain account for add-member by default', () => {
    expect(protocolNearAccountFieldIssue('missing', 'ghost.testnet')).toMatch(
      /no near account/i
    );
    expect(
      protocolNearAccountFieldIssue('missing', 'ghost.testnet', {
        requireOnChain: false,
      })
    ).toBeNull();
  });
});

describe('isProtocolNearAccountFieldReady', () => {
  it('accepts found accounts for add-member', () => {
    expect(
      isProtocolNearAccountFieldReady('found', 'alice.testnet', {
        requireOnChain: true,
      })
    ).toBe(true);
  });

  it('accepts settled missing ids for remove-member', () => {
    expect(
      isProtocolNearAccountFieldReady('missing', 'ghost.testnet', {
        requireOnChain: false,
      })
    ).toBe(true);
  });

  it('blocks submit while idle or checking', () => {
    expect(isProtocolNearAccountFieldReady('idle', 'alice.testnet')).toBe(false);
    expect(isProtocolNearAccountFieldReady('checking', 'alice.testnet')).toBe(
      false
    );
  });
});
