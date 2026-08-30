import { describe, expect, it } from 'vitest';
import { buildEndorsementEmptyState } from './endorsement-empty-state';

describe('buildEndorsementEmptyState', () => {
  it('keeps Discover on the viewer given empty', () => {
    expect(
      buildEndorsementEmptyState({
        mode: 'given',
        isSelf: true,
        displayName: 'You',
      })
    ).toEqual({
      primary: 'You have not endorsed anyone yet.',
      showDiscover: true,
    });
  });

  it('invites a visitor to vouch on an empty received list', () => {
    expect(
      buildEndorsementEmptyState({
        mode: 'received',
        isSelf: false,
        displayName: 'Alice',
      })
    ).toEqual({
      primary: 'No endorsements for Alice yet.',
      secondary: 'Be the first to put your name behind them.',
      showDiscover: false,
    });
  });
});
