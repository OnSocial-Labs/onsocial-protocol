import { describe, expect, it } from 'vitest';
import {
  getDaoProposalKindName,
  normalizeDaoProposalKind,
} from './governance-proposal-kind';

describe('governance proposal kind normalization', () => {
  it('reads vote kind from NEAR string enums', () => {
    expect(getDaoProposalKindName('Vote')).toBe('Vote');
    expect(normalizeDaoProposalKind('Vote')).toEqual({ Vote: null });
  });

  it('keeps object-shaped kinds unchanged', () => {
    const kind = { Transfer: { receiver_id: 'alice.testnet', amount: '1' } };
    expect(getDaoProposalKindName(kind)).toBe('Transfer');
    expect(normalizeDaoProposalKind(kind)).toBe(kind);
  });
});
