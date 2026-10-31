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

  it('shows minus for a member and hides it for the owner', () => {
    expect(guildHeroActionVisibility({ isMember: true })).toEqual({
      showJoin: false,
      showLeave: true,
      showSettings: false,
    });
    expect(
      guildHeroActionVisibility({ isMember: true, isOwner: true })
    ).toEqual({
      showJoin: false,
      showLeave: false,
      showSettings: true,
    });
  });

  it('shows the gear for owners and admins', () => {
    expect(guildHeroActionVisibility({ isAdmin: true })).toEqual({
      showJoin: true,
      showLeave: false,
      showSettings: true,
    });
    expect(
      guildHeroActionVisibility({ isMember: true, isAdmin: true })
    ).toEqual({
      showJoin: false,
      showLeave: true,
      showSettings: true,
    });
  });
});
