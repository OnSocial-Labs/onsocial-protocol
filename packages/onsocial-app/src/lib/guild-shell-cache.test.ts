import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGuildShellCacheForTests,
  GUILD_SHELL_CACHE_MAX,
  readGuildShellCache,
  writeGuildShellCache,
} from './guild-shell-cache';

const shell = {
  name: 'Social Rebels',
  avatarUrl: 'https://example.com/a.png',
  bannerUrl: null as string | null,
  accessGated: false,
  memberDriven: true,
  description: '',
  topics: [] as string[],
};

describe('guildShellCache', () => {
  beforeEach(() => {
    clearGuildShellCacheForTests();
  });

  it('reads what it writes', () => {
    writeGuildShellCache('dao', shell);
    expect(readGuildShellCache('dao')).toEqual(shell);
  });

  it('evicts oldest when over max', () => {
    for (let i = 0; i < GUILD_SHELL_CACHE_MAX + 3; i += 1) {
      writeGuildShellCache(`g${i}`, { ...shell, name: `Guild ${i}` });
    }
    expect(readGuildShellCache('g0')).toBeUndefined();
    expect(readGuildShellCache(`g${GUILD_SHELL_CACHE_MAX + 2}`)?.name).toBe(
      `Guild ${GUILD_SHELL_CACHE_MAX + 2}`
    );
  });

  it('LRU refreshes on read so hot entries survive', () => {
    writeGuildShellCache('hot', shell);
    for (let i = 0; i < GUILD_SHELL_CACHE_MAX; i += 1) {
      expect(readGuildShellCache('hot')?.name).toBe('Social Rebels');
      writeGuildShellCache(`c${i}`, { ...shell, name: `Cold ${i}` });
    }
    expect(readGuildShellCache('hot')?.name).toBe('Social Rebels');
  });
});
