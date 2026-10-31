import { describe, expect, it } from 'vitest';
import { guildHeroActionVisibility } from '@/features/guilds/guild-hero-actions';

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
