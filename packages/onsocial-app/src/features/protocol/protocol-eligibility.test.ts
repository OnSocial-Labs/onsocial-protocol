import { describe, expect, it } from 'vitest';
import { viewerCanProposeOnDao } from '@/features/protocol/protocol-eligibility';

describe('viewerCanProposeOnDao', () => {
  it('is false without eligibility', () => {
    expect(viewerCanProposeOnDao(null)).toBe(false);
    expect(viewerCanProposeOnDao(undefined)).toBe(false);
  });

  it('uses policy canAddProposal when present', () => {
    expect(
      viewerCanProposeOnDao({
        canPropose: false,
        isGroupMember: true,
        canAddProposal: false,
      })
    ).toBe(false);
    expect(
      viewerCanProposeOnDao({
        canPropose: false,
        isGroupMember: false,
        canAddProposal: true,
      })
    ).toBe(true);
  });

  it('falls back to group or weight when canAddProposal is omitted', () => {
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
