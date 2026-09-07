import { describe, expect, it } from 'vitest';
import { guildCreateAboutToggle } from '@/features/guilds/guild-create-voice';

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
