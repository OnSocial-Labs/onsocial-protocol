import { describe, expect, it } from 'vitest';
import { hubHeroActionVisibility } from '@/features/scarces/hub-hero-actions';

describe('hubHeroActionVisibility', () => {
  it('shows the plus on an approval hub for a guest and a signed-out visitor', () => {
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'approval',
        canCreate: false,
        isAuthority: false,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: true, showSettings: false });
  });

  it('hides the plus once the viewer can publish, and shows the gear for staff', () => {
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'approval',
        canCreate: true,
        isAuthority: false,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: false, showSettings: false });
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'approval',
        canCreate: true,
        isAuthority: true,
        isOwner: true,
      })
    ).toEqual({ showPublishRequest: false, showSettings: true });
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'approval',
        canCreate: true,
        isAuthority: true,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: false, showSettings: true });
  });

  it('keeps the gear for an open-hub owner and leaves moderators without an empty menu', () => {
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'open',
        canCreate: true,
        isAuthority: true,
        isOwner: true,
      })
    ).toEqual({ showPublishRequest: false, showSettings: true });
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'open',
        canCreate: true,
        isAuthority: true,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: false, showSettings: false });
  });

  it('offers no ask on an invite hub, and keeps the gear for staff', () => {
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'invite_only',
        canCreate: false,
        isAuthority: false,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: false, showSettings: false });
    expect(
      hubHeroActionVisibility({
        creatorAccess: 'invite_only',
        canCreate: true,
        isAuthority: true,
        isOwner: false,
      })
    ).toEqual({ showPublishRequest: false, showSettings: true });
  });
});
