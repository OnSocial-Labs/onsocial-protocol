import { describe, expect, it } from 'vitest';
import {
  canConfigureGuild,
  canOpenGuildSettings,
  guildSettingsActions,
} from '@/features/guilds/guild-settings-actions';

describe('guildSettingsActions', () => {
  it('lists proposals first, then the tools an owner or admin can finish', () => {
    expect(
      guildSettingsActions({ isOwner: true, isAdmin: false }).map(
        (row) => row.id
      )
    ).toEqual(['proposals', 'edit', 'rooms', 'storage']);
    expect(
      guildSettingsActions({
        isOwner: false,
        isAdmin: true,
        isMember: true,
      }).map((row) => row.label)
    ).toEqual(['Proposals', 'Edit guild', 'Rooms', 'Guild storage']);
  });

  it('shows members proposals only', () => {
    expect(
      guildSettingsActions({
        isOwner: false,
        isAdmin: false,
        isMember: true,
      }).map((row) => row.id)
    ).toEqual(['proposals']);
    expect(
      canOpenGuildSettings({
        isOwner: false,
        isAdmin: false,
        isMember: true,
      })
    ).toBe(true);
    expect(canConfigureGuild({ isOwner: false, isAdmin: false })).toBe(false);
  });

  it('hides the drawer from guests', () => {
    expect(guildSettingsActions({ isOwner: false, isAdmin: false })).toEqual(
      []
    );
    expect(
      guildSettingsActions({
        isOwner: false,
        isAdmin: false,
        isMember: false,
      })
    ).toEqual([]);
    expect(guildSettingsActions(null)).toEqual([]);
    expect(canOpenGuildSettings(null)).toBe(false);
    expect(canConfigureGuild({ isOwner: false, isAdmin: false })).toBe(false);
    expect(canConfigureGuild({ isOwner: true, isAdmin: false })).toBe(true);
    expect(canOpenGuildSettings({ isOwner: true, isAdmin: false })).toBe(true);
  });
});
