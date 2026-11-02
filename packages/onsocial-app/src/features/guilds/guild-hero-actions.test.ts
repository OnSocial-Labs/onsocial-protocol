import { describe, expect, it } from 'vitest';
import {
  guildHeroActionVisibility,
  guildHeroIconsForViewer,
  guildViewerOwnsShell,
} from '@/features/guilds/guild-hero-actions';

describe('guildHeroActionVisibility', () => {
  it('shows plus for someone who has not joined', () => {
    expect(guildHeroActionVisibility({})).toEqual({
      showJoin: true,
      showLeave: false,
      showSettings: false,
    });
  });

  it('shows minus and the gear for a member, and hides leave for the owner', () => {
    expect(
      guildHeroActionVisibility({ isMember: true, canOpenSettings: true })
    ).toEqual({
      showJoin: false,
      showLeave: true,
      showSettings: true,
    });
    expect(
      guildHeroActionVisibility({
        isMember: true,
        isOwner: true,
        canOpenSettings: true,
      })
    ).toEqual({
      showJoin: false,
      showLeave: false,
      showSettings: true,
    });
  });

  it('holds leave while the member might still be the owner', () => {
    expect(
      guildHeroActionVisibility({
        isMember: true,
        roleKnown: false,
      })
    ).toEqual({
      showJoin: false,
      showLeave: false,
      showSettings: false,
    });
  });

  it('treats the shell owner as the gear, before the role view returns', () => {
    expect(guildViewerOwnsShell('Alice.Near', 'alice.near')).toBe(true);
    expect(guildViewerOwnsShell('alice.near', 'bob.near')).toBe(false);
    expect(guildViewerOwnsShell('', 'alice.near')).toBe(false);
    expect(
      guildHeroIconsForViewer({
        accountId: 'greenghost.onsocial.testnet',
        ownerId: 'greenghost.onsocial.testnet',
        isMember: true,
      })
    ).toEqual({
      showJoin: false,
      showLeave: false,
      showSettings: true,
    });
  });

  it('shows leave for a member when someone else is the roster owner', () => {
    expect(
      guildHeroIconsForViewer({
        accountId: 'test03.onsocial.testnet',
        ownerId: 'greenghost.onsocial.testnet',
        isMember: true,
        chainIsOwner: true,
        accessResolved: true,
        canOpenSettings: true,
      })
    ).toEqual({
      showJoin: false,
      showLeave: true,
      showSettings: true,
    });
  });

  it('paints nothing until the roster owner is known', () => {
    expect(
      guildHeroIconsForViewer({
        accountId: 'test03.onsocial.testnet',
        ownerId: null,
        isMember: true,
        chainIsOwner: true,
        accessResolved: true,
        canOpenSettings: true,
      })
    ).toEqual({
      showJoin: false,
      showLeave: false,
      showSettings: false,
    });
  });

  it('shows the gear whenever settings can open', () => {
    expect(
      guildHeroActionVisibility({ isAdmin: true, canOpenSettings: true })
    ).toEqual({
      showJoin: true,
      showLeave: false,
      showSettings: true,
    });
    expect(guildHeroActionVisibility({ isAdmin: true })).toEqual({
      showJoin: true,
      showLeave: false,
      showSettings: false,
    });
  });
});
