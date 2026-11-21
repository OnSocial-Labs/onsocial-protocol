import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'live-guild-post-panel.tsx'), 'utf8');

describe('guild post page join gate', () => {
  it('keeps membership join on the guild page, not in the thread column', () => {
    expect(source).not.toContain('GuildMembershipJoinButton');
    expect(source).not.toContain('guild-thread-join-dock');
    expect(source).not.toContain('needsJoinToReply');
    expect(source).toContain('gateGuildWrite');
    expect(source).toContain('Join this guild to reply, quote, or repost.');
    expect(source).toContain('guildPath(groupId)');
  });
});
