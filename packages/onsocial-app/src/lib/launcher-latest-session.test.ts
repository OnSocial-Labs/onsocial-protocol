import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LAUNCHER_LATEST_SESSION_TTL_MS,
  clearLauncherLatestSession,
  peekLauncherLatestSession,
  readLauncherLatestSession,
  writeLauncherLatestSession,
} from './launcher-latest-session';

afterEach(() => {
  clearLauncherLatestSession();
});

describe('launcher latest session snapshot', () => {
  it('round-trips guilds, hubs, and daos separately in memory', () => {
    writeLauncherLatestSession({
      kind: 'guilds',
      accountId: 'alice.near',
      items: [{ key: 'g1' }],
    });
    writeLauncherLatestSession({
      kind: 'hubs',
      accountId: 'alice.near',
      items: [{ key: 'h1' }],
    });
    writeLauncherLatestSession({
      kind: 'daos',
      accountId: 'alice.near',
      items: [{ key: 'd1' }],
    });

    expect(readLauncherLatestSession('guilds', 'alice.near')).toEqual([
      { key: 'g1' },
    ]);
    expect(readLauncherLatestSession('hubs', 'ALICE.near')).toEqual([
      { key: 'h1' },
    ]);
    expect(readLauncherLatestSession('daos', 'alice.near')).toEqual([
      { key: 'd1' },
    ]);
    expect(readLauncherLatestSession('guilds', 'bob.near')).toBeNull();
    expect(peekLauncherLatestSession('guilds')?.items).not.toBe(
      peekLauncherLatestSession('guilds')?.items
    );
  });

  it('stores an empty latest list so a known empty does not skeleton', () => {
    writeLauncherLatestSession({
      kind: 'guilds',
      accountId: 'alice.near',
      items: [],
    });
    expect(readLauncherLatestSession('guilds', 'alice.near')).toEqual([]);
  });

  it('does not store an unfetched list', () => {
    writeLauncherLatestSession({
      kind: 'hubs',
      accountId: 'alice.near',
      items: null,
    });
    expect(peekLauncherLatestSession('hubs')).toBeNull();
  });

  it('expires after the session TTL', () => {
    writeLauncherLatestSession({
      kind: 'daos',
      accountId: 'alice.near',
      items: [{ key: 'd1' }],
      now: 1_000,
    });
    expect(
      peekLauncherLatestSession(
        'daos',
        1_000 + LAUNCHER_LATEST_SESSION_TTL_MS + 1
      )
    ).toBeNull();
  });
});

describe('launcher latest session wiring', () => {
  it('restores Guilds, Hubs, and DAOs latest lists on remount without storage', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const guildsSrc = readFileSync(
      join(libDir, '../features/guilds/guilds-latest-posts-panel.tsx'),
      'utf8'
    );
    const hubsSrc = readFileSync(
      join(libDir, '../features/scarces/hubs-latest-drops-panel.tsx'),
      'utf8'
    );
    const daosSrc = readFileSync(
      join(libDir, '../features/protocol/daos-explore-panel.tsx'),
      'utf8'
    );
    expect(guildsSrc).toContain('readLauncherLatestSession');
    expect(guildsSrc).toContain('writeLauncherLatestSession');
    expect(guildsSrc).not.toContain('sessionStorage.setItem');
    expect(hubsSrc).toContain('readLauncherLatestSession');
    expect(hubsSrc).toContain('writeLauncherLatestSession');
    expect(hubsSrc).not.toContain('sessionStorage.setItem');
    expect(daosSrc).toContain('readLauncherLatestSession');
    expect(daosSrc).toContain('writeLauncherLatestSession');
    expect(daosSrc).not.toContain('sessionStorage.setItem');
  });
});
