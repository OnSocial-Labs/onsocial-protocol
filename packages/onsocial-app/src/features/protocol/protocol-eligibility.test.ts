import { describe, expect, it } from 'vitest';
import { viewerCanProposeOnDao } from '@/features/protocol/protocol-eligibility';

describe('viewerCanProposeOnDao', () => {
  it('is false without eligibility', () => {
    expect(viewerCanProposeOnDao(null)).toBe(false);
    expect(viewerCanProposeOnDao(undefined)).toBe(false);
  });

  it('accepts group membership or stake weight', () => {
    expect(
      viewerCanProposeOnDao({ canPropose: false, isGroupMember: true })
    ).toBe(true);
    expect(
      viewerCanProposeOnDao({ canPropose: true, isGroupMember: false })
    ).toBe(true);
    expect(
      viewerCanProposeOnDao({ canPropose: false, isGroupMember: false })
    ).toBe(false);
  });
});
