import { describe, expect, it } from 'vitest';
import {
  protocolVoteSheetLede,
  protocolVoteSheetMeta,
  protocolVoteSheetTitle,
} from '@/features/protocol/protocol-vote-sheet-copy';

const baseView = {
  canFinalize: false,
  finalizeLabel: 'Finalize',
  roleName: 'council',
  statusLabel: 'In review',
  status: 'InProgress' as const,
  approveVotes: 0,
  rejectVotes: 0,
  currentVote: null,
  canApprove: true,
  canReject: true,
  deadline: {
    relative: 'in 2d',
    absolute: '',
    expired: false,
    prefix: 'Closes',
  },
};

describe('protocolVoteSheetTitle', () => {
  it('matches the card vote CTA', () => {
    expect(protocolVoteSheetTitle(baseView)).toBe('Vote');
    expect(
      protocolVoteSheetTitle({ ...baseView, canFinalize: true })
    ).toBe('Finalize');
  });
});

describe('protocolVoteSheetMeta', () => {
  it('leads with review state and closes deadline', () => {
    expect(protocolVoteSheetMeta(baseView)).toBe(
      'In review · 0 approve · 0 reject · Closes in 2d'
    );
  });

  it('shows role only when the viewer cannot vote', () => {
    expect(
      protocolVoteSheetMeta({
        ...baseView,
        canApprove: false,
        canReject: false,
      })
    ).toBe('Council · In review · 0 approve · 0 reject · Closes in 2d');
  });

  it('skips deadline when review ended', () => {
    expect(
      protocolVoteSheetMeta({
        ...baseView,
        statusLabel: 'Expired',
        status: 'Expired',
        deadline: { ...baseView.deadline!, expired: true },
      })
    ).toBe('Expired · 0 approve · 0 reject');
  });
});

describe('protocolVoteSheetLede', () => {
  it('stays quiet while the member can still vote', () => {
    expect(protocolVoteSheetLede(baseView)).toBeNull();
  });

  it('reflects an existing vote', () => {
    expect(
      protocolVoteSheetLede({
        ...baseView,
        currentVote: 'Approve',
        canApprove: false,
        canReject: false,
      })
    ).toBe('You approved this proposal.');
  });
});
