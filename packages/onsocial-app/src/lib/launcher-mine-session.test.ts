import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LAUNCHER_MINE_SESSION_TTL_MS,
  clearLauncherMineSession,
  peekLauncherMineSession,
  readLauncherMineSession,
  writeLauncherMineSession,
} from './launcher-mine-session';

afterEach(() => {
  clearLauncherMineSession();
});

describe('launcher mine session snapshot', () => {
  it('round-trips guilds and hubs separately in memory', () => {
    writeLauncherMineSession({
      kind: 'guilds',
      accountId: 'alice.near',
      items: [{ groupId: 'os' }],
    });
    writeLauncherMineSession({
      kind: 'hubs',
      accountId: 'alice.near',
      items: [{ appId: 'shop' }],
    });

    expect(readLauncherMineSession('guilds', 'alice.near')).toEqual([
      { groupId: 'os' },
    ]);
    expect(readLauncherMineSession('hubs', 'ALICE.near')).toEqual([
      { appId: 'shop' },
    ]);
    expect(readLauncherMineSession('guilds', 'bob.near')).toBeNull();
    expect(peekLauncherMineSession('guilds')?.items).not.toBe(
      peekLauncherMineSession('guilds')?.items
    );
  });

  it('stores an empty mine rail so a known empty does not skeleton', () => {
    writeLauncherMineSession({
      kind: 'guilds',
      accountId: 'alice.near',
      items: [],
    });
    expect(readLauncherMineSession('guilds', 'alice.near')).toEqual([]);
  });

  it('does not store an unfetched rail', () => {
    writeLauncherMineSession({
      kind: 'hubs',
      accountId: 'alice.near',
      items: null,
    });
    expect(peekLauncherMineSession('hubs')).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeLauncherMineSession({
      kind: 'guilds',
      accountId: 'alice.near',
      items: [{ groupId: 'os' }],
      now: 1_000,
    });
    expect(
      peekLauncherMineSession(
        'guilds',
        1_000 + LAUNCHER_MINE_SESSION_TTL_MS + 1
      )
    ).toBeNull();
  });
});

describe('launcher mine session wiring', () => {
  it('restores Guilds and Hubs mine rails on remount without storage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const guildsSrc = readFileSync(
      join(libDir, '../features/guilds/live-guilds-index-panel.tsx'),
      'utf8'
    );
    const hubsSrc = readFileSync(
      join(libDir, '../features/scarces/hubs-index-panel.tsx'),
      'utf8'
    );
    expect(guildsSrc).toContain("readLauncherMineSession('guilds'");
    expect(guildsSrc).toContain('writeLauncherMineSession');
    expect(guildsSrc).not.toContain('sessionStorage.setItem');
    expect(hubsSrc).toContain("readLauncherMineSession('hubs'");
    expect(hubsSrc).toContain('writeLauncherMineSession');
    expect(hubsSrc).not.toContain('sessionStorage.setItem');
  });
});
