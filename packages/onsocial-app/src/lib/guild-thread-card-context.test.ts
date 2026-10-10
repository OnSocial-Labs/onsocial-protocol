import { describe, expect, it } from 'vitest';
import { guildThreadCardContext } from './guild-thread-card-context';

describe('guildThreadCardContext', () => {
  it('shows the guild line and the room when the post is opened from outside', () => {
    expect(
      guildThreadCardContext({
        groupId: 'social',
        postChannel: 'general',
        openedFrom: null,
      })
    ).toEqual({ showGuildLine: true, showChannel: true });
  });

  it('hides the guild line on the guild feed and keeps the room on All', () => {
    expect(
      guildThreadCardContext({
        groupId: 'social',
        postChannel: 'general',
        openedFrom: { guildId: 'social', roomId: null },
      })
    ).toEqual({ showGuildLine: false, showChannel: true });
  });

  it('hides the guild line and the room inside one room', () => {
    expect(
      guildThreadCardContext({
        groupId: 'social',
        postChannel: 'general',
        openedFrom: { guildId: 'social', roomId: 'general' },
      })
    ).toEqual({ showGuildLine: false, showChannel: false });
  });

  it('shows the guild line when the open came from a different guild', () => {
    expect(
      guildThreadCardContext({
        groupId: 'social',
        postChannel: null,
        openedFrom: { guildId: 'other', roomId: 'general' },
      })
    ).toEqual({ showGuildLine: true, showChannel: false });
  });
});
