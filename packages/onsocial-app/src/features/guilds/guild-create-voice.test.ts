import { describe, expect, it } from 'vitest';
import {
  GUILD_CREATE_ADD_BADGE,
  GUILD_CREATE_ADD_BANNER,
  guildCreateAboutToggle,
} from '@/features/guilds/guild-create-voice';

describe('guildCreateAboutToggle', () => {
  it('uses Add / Edit / Hide about', () => {
    expect(guildCreateAboutToggle({ open: false, hasText: false })).toBe(
      'Add about'
    );
    expect(guildCreateAboutToggle({ open: false, hasText: true })).toBe(
      'Edit about'
    );
    expect(guildCreateAboutToggle({ open: true, hasText: true })).toBe(
      'Hide about'
    );
  });
});

describe('guild look voice', () => {
  it('says Banner and Badge, not Logo or Cover', () => {
    expect(GUILD_CREATE_ADD_BANNER).toBe('Add banner');
    expect(GUILD_CREATE_ADD_BADGE).toBe('Add badge');
  });
});
