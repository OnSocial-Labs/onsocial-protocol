import { describe, expect, it } from 'vitest';
import {
  formatGuildMemberCount,
  guildCardMetaTags,
  guildDisplayInitials,
  guildDisplayName,
  guildModeId,
  guildModeLabel,
  guildModeDescription,
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

  it('formats pub guild technical names', () => {
    expect(
      guildDisplayName('Guild pub-1771027510', 'grp_pub_1771027510_room1')
    ).toBe('Public ·7510');
    expect(guildDisplayName(null, 'grp_pub_1771027510_room1')).toBe(
      'Public ·7510'
    );
  });

  it('strips raw-id words embedded in stored names', () => {
    expect(
      guildDisplayName(
        'MD grp_md_perm_1779813274071_ojf237',
        'grp_md_perm_1779813274071_ojf237'
      )
    ).toBe('MD');
    // Name that is only the raw id still falls back to the suffix form.
    expect(
      guildDisplayName(
        'grp_md_perm_1779813274071_ojf237',
        'grp_md_perm_1779813274071_ojf237'
      )
    ).toBe('Guild ojf237');
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

  it('resolves one mode with member-led winning over invite', () => {
    expect(
      guildModeId({ accessGated: false, memberDriven: false })
    ).toBe('open');
    expect(
      guildModeId({ accessGated: true, memberDriven: false })
    ).toBe('invite');
    expect(
      guildModeId({ accessGated: true, memberDriven: true })
    ).toBe('member-led');
    expect(guildModeLabel({ accessGated: true, memberDriven: true })).toBe(
      'Member-led'
    );
    expect(guildModeLabel({ accessGated: true, memberDriven: false })).toBe(
      'Invite only'
    );
    expect(guildModeLabel({ accessGated: false, memberDriven: false })).toBe(
      'Open'
    );
    expect(
      guildModeDescription({ accessGated: true, memberDriven: true })
    ).toMatch(/proposals/i);
    expect(
      guildModeDescription({ accessGated: true, memberDriven: false })
    ).toMatch(/approval/i);
    expect(
      guildModeDescription({ accessGated: false, memberDriven: false })
    ).toMatch(/join and post/i);
  });

  it('always shows the mode pill, including Open', () => {
    expect(
      guildCardMetaTags({
        role: 'Member',
        accessGated: true,
        memberDriven: true,
      })
    ).toEqual([
      { key: 'mode', label: 'Member-led', tone: 'accent' },
    ]);
    expect(
      guildCardMetaTags({
        role: 'Member',
        accessGated: true,
        memberDriven: false,
      })
    ).toEqual([{ key: 'mode', label: 'Invite only', tone: 'default' }]);
    expect(
      guildCardMetaTags({
        role: 'Member',
        accessGated: false,
        memberDriven: false,
      })
    ).toEqual([{ key: 'mode', label: 'Open', tone: 'default' }]);
  });

  it('keeps Open visible on rail peeks', () => {
    expect(
      guildCardMetaTags({
        role: 'Member',
        accessGated: false,
        memberDriven: false,
      })
    ).toEqual([{ key: 'mode', label: 'Open', tone: 'default' }]);
    expect(
      guildCardMetaTags({
        role: 'Owner',
        accessGated: true,
        memberDriven: true,
      })
    ).toEqual([
      { key: 'role', label: 'Owner', tone: 'owner' },
      { key: 'mode', label: 'Member-led', tone: 'accent' },
    ]);
  });

  it('formats member counts for card meta', () => {
    expect(formatGuildMemberCount(1)).toBe('1 member');
    expect(formatGuildMemberCount(12)).toBe('12 members');
  });
});
