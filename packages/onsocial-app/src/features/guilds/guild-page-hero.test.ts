import { describe, expect, it } from 'vitest';
import { guildDisplayName } from '@/features/guilds/guild-card-display';
import { guildPageHeroLook } from '@/features/guilds/guild-page-hero';

describe('guildPageHeroLook', () => {
  it('copies the painted shell fields the hero renders', () => {
    const look = guildPageHeroLook({
      name: 'Audit Guild',
      bannerUrl: 'https://cdn.example/banner.jpg',
      badgeUrl: null,
      accessGated: false,
      memberDriven: true,
      description: 'A room for audits.',
      topics: ['art'],
    });
    expect(look).toEqual({
      name: 'Audit Guild',
      bannerUrl: 'https://cdn.example/banner.jpg',
      badgeUrl: null,
      accessGated: false,
      memberDriven: true,
      description: 'A room for audits.',
      topics: ['art'],
    });
    expect(guildDisplayName(look.name, 'audit-guild')).toBe('Audit Guild');
  });
});
