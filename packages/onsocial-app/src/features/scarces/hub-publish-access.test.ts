import { describe, expect, it } from 'vitest';
import { parsePublishAccessRequest } from '@/features/scarces/hub-publish-access';

describe('parsePublishAccessRequest', () => {
  it('reads a contract view row', () => {
    expect(
      parsePublishAccessRequest({
        account_id: 'creator.testnet',
        status: 'pending',
        message: 'prints',
        requested_at: '1700000000000000000',
      })
    ).toEqual({
      accountId: 'creator.testnet',
      status: 'pending',
      message: 'prints',
      requestedAtMs: 1_700_000_000_000,
      decidedBy: null,
    });
  });

  it('drops empty notes and unknown rows', () => {
    expect(
      parsePublishAccessRequest({
        account_id: 'creator.testnet',
        status: 'blocked',
        message: '   ',
        requested_at: 0,
        decided_by: 'owner.testnet',
      })?.message
    ).toBeNull();
    expect(parsePublishAccessRequest(null)).toBeNull();
    expect(
      parsePublishAccessRequest({ account_id: 'a', status: 'approved' })
    ).toBeNull();
  });
});
