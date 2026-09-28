import { describe, expect, it } from 'vitest';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import {
  protocolFacePairIndex,
  protocolFacePairKindFromPager,
  protocolFacePairProgress,
  protocolFacePairSibling,
  protocolFacePairThumbBox,
} from '@/lib/protocol-face-pair';

describe('protocol face pair', () => {
  it('pairs governance and treasury only', () => {
    expect(protocolFacePairSibling(GOVERNANCE_DAO_ACCOUNT)).toBe(
      TREASURY_DAO_ACCOUNT
    );
    expect(protocolFacePairSibling(TREASURY_DAO_ACCOUNT)).toBe(
      GOVERNANCE_DAO_ACCOUNT
    );
    expect(protocolFacePairSibling('alice.testnet')).toBeNull();
  });

  it('tracks pager progress and settles halfway onto the next face', () => {
    expect(protocolFacePairIndex('governance')).toBe(0);
    expect(protocolFacePairIndex('treasury')).toBe(1);
    expect(protocolFacePairProgress(0, 390)).toBe(0);
    expect(protocolFacePairProgress(195, 390)).toBe(0.5);
    expect(protocolFacePairProgress(390, 390)).toBe(1);
    expect(protocolFacePairKindFromPager(194, 390)).toBe('governance');
    expect(protocolFacePairKindFromPager(195, 390)).toBe('treasury');
  });

  it('slides the pill fill between the two words', () => {
    const boxes = [
      { left: 2, width: 80 },
      { left: 86, width: 70 },
    ];
    expect(protocolFacePairThumbBox(0, boxes)).toEqual({ left: 2, width: 80 });
    expect(protocolFacePairThumbBox(0.5, boxes)).toEqual({
      left: 44,
      width: 75,
    });
    expect(protocolFacePairThumbBox(1, boxes)).toEqual({
      left: 86,
      width: 70,
    });
    expect(protocolFacePairThumbBox(0, [])).toBeNull();
  });
});
