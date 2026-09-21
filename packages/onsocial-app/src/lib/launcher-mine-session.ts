import { accountIdsEqual } from '@/lib/account-match';

/** In-tab memory only — hard refresh starts cold. */
export const LAUNCHER_MINE_SESSION_TTL_MS = 30 * 60 * 1000;

export type LauncherMineKind = 'guilds' | 'hubs' | 'daos';

type LauncherMineSlot = {
  accountId: string;
  items: unknown[];
  savedAt: number;
};

const slots: Record<LauncherMineKind, LauncherMineSlot | null> = {
  guilds: null,
  hubs: null,
  daos: null,
};

export function clearLauncherMineSession(kind?: LauncherMineKind): void {
  if (kind) {
    slots[kind] = null;
    return;
  }
  slots.guilds = null;
  slots.hubs = null;
  slots.daos = null;
}

export function writeLauncherMineSession<T>(input: {
  kind: LauncherMineKind;
  accountId: string | null;
  items: readonly T[] | null;
  now?: number;
}): void {
  const accountId = input.accountId?.trim();
  if (!accountId || input.items == null) return;
  slots[input.kind] = {
    accountId,
    items: [...input.items],
    savedAt: input.now ?? Date.now(),
  };
}

export function peekLauncherMineSession<T>(
  kind: LauncherMineKind,
  now: number = Date.now()
): { accountId: string; items: T[] } | null {
  const slot = slots[kind];
  if (!slot) return null;
  if (now - slot.savedAt > LAUNCHER_MINE_SESSION_TTL_MS) {
    slots[kind] = null;
    return null;
  }
  return {
    accountId: slot.accountId,
    items: [...slot.items] as T[],
  };
}

export function readLauncherMineSession<T>(
  kind: LauncherMineKind,
  accountId: string | null,
  now: number = Date.now()
): T[] | null {
  if (!accountId?.trim()) return null;
  const peeked = peekLauncherMineSession<T>(kind, now);
  if (!peeked || !accountIdsEqual(peeked.accountId, accountId)) return null;
  return peeked.items;
}
