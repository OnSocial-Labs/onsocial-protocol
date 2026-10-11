import { describe, expect, it } from 'vitest';
import {
  canConfigureGuild,
  guildSettingsActions,
} from '@/features/guilds/guild-settings-actions';

describe('guildSettingsActions', () => {
  it('lists the tools an owner or admin can finish', () => {
    expect(
      guildSettingsActions({ isOwner: true, isAdmin: false }).map(
        (row) => row.id
      )
    ).toEqual(['edit', 'rooms', 'storage']);
    expect(
      guildSettingsActions({ isOwner: false, isAdmin: true }).map(
        (row) => row.label
      )
    ).toEqual(['Edit guild', 'Rooms', 'Guild storage']);
  });

  it('hides the drawer actions from members and moderators', () => {
    expect(guildSettingsActions({ isOwner: false, isAdmin: false })).toEqual(
      []
    );
    expect(guildSettingsActions(null)).toEqual([]);
    expect(canConfigureGuild({ isOwner: false, isAdmin: false })).toBe(false);
    expect(canConfigureGuild({ isOwner: true, isAdmin: false })).toBe(true);
  });
});
