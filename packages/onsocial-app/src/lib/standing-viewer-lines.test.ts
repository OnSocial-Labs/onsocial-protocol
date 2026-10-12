import { describe, expect, it } from 'vitest';
import { applyStandingViewerLines } from './standing-viewer-lines';
import type { StandingAccountSummary } from './profile-social-standings';

function account(accountId: string): StandingAccountSummary {
  return {
    accountId,
    name: accountId,
    avatarUrl: null,
    viewerStanding: false,
    theyStandWithViewer: false,
    targetEndorsedViewer: false,
    viewerEndorsed: false,
  };
}

describe('applyStandingViewerLines', () => {
  it('sets the four relationship flags from the ids already on screen', () => {
    const merged = applyStandingViewerLines(
      [account('alice.near'), account('bob.near')],
      {
        viewerOutgoingPeerIds: ['bob.near'],
        viewerIncomingPeerIds: ['alice.near'],
        viewerEndorsementIssuerIds: ['alice.near'],
        viewerEndorsementTargetIds: ['bob.near'],
      }
    );

    expect(merged[0]).toMatchObject({
      accountId: 'alice.near',
      viewerStanding: false,
      theyStandWithViewer: true,
      targetEndorsedViewer: true,
      viewerEndorsed: false,
    });
    expect(merged[1]).toMatchObject({
      accountId: 'bob.near',
      viewerStanding: true,
      theyStandWithViewer: false,
      targetEndorsedViewer: false,
      viewerEndorsed: true,
    });
  });

  it('leaves flags off when the thin read has no edges', () => {
    const merged = applyStandingViewerLines([account('alice.near')], {
      viewerOutgoingPeerIds: [],
      viewerIncomingPeerIds: [],
      viewerEndorsementIssuerIds: [],
      viewerEndorsementTargetIds: [],
    });
    expect(merged[0]?.viewerStanding).toBe(false);
    expect(merged[0]?.theyStandWithViewer).toBe(false);
    expect(merged[0]?.targetEndorsedViewer).toBe(false);
    expect(merged[0]?.viewerEndorsed).toBe(false);
  });
});
