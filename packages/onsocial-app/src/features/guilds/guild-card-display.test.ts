import { describe, expect, it } from 'vitest';
import {
  formatGuildMemberCount,
  guildCardMetaTags,
  guildDisplayInitials,
  guildDisplayName,
  guildRoleBadgeLabel,
  isRawGroupId,
} from '@/features/guilds/guild-card-display';

describe('guild-card-display', () => {
  it('detects raw generated guild ids', () => {
    expect(isRawGroupId('grp_md_perm_1779813274071_ojf237')).toBe(true);
    expect(isRawGroupId('Social Rebels #1')).toBe(false);
  });

  it('formats readable names for raw guild ids', () => {
    expect(
      guildDisplayName(null, 'grp_md_perm_1779813274071_ojf237')
    ).toBe('Guild ojf237');
    expect(guildDisplayName('Social Rebels #1', 'grp_test')).toBe(
      'Social Rebels #1'
    );
  });

  it('derives meaningful initials from display names', () => {
    expect(
      guildDisplayInitials('Social Rebels #1', 'grp_test')
    ).toBe('SR');
    expect(
      guildDisplayInitials(null, 'grp_md_perm_1779813274071_ojf237')
    ).toBe('OJ');
  });

  it('hides generic member role badges', () => {
    expect(guildRoleBadgeLabel('Member')).toBeNull();
    expect(guildRoleBadgeLabel('Owner')).toBe('Owner');
  });

  it('builds compact meta tags without member noise', () => {
    expect(
      guildCardMetaTags({
        role: 'Member',
        accessGated: true,
        memberDriven: true,
      })
    ).toEqual([
      { key: 'access', label: 'Access-gated' },
      { key: 'governance', label: 'Collaborative', tone: 'accent' },
    ]);
  });

  it('formats member counts for card meta', () => {
    expect(formatGuildMemberCount(1)).toBe('1 member');
    expect(formatGuildMemberCount(12)).toBe('12 members');
  });
});
