import { normalizeAppId } from './auth-handoff.js';

export const APP_HANDOFF_SESSION_PREFIX = 'onsocial.app.session.';

export type StoredAppHandoffSession = {
  appId: string;
  accountId: string;
  refreshToken: string;
};

function storageKey(appId: string): string {
  return `${APP_HANDOFF_SESSION_PREFIX}${appId}`;
}

function readStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readAppHandoffSession(
  appId: string
): StoredAppHandoffSession | null {
  const id = normalizeAppId(appId);
  const ls = readStorage();
  if (!id || !ls) return null;
  try {
    const raw = ls.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAppHandoffSession>;
    if (
      parsed.appId !== id ||
      typeof parsed.accountId !== 'string' ||
      !parsed.accountId ||
      typeof parsed.refreshToken !== 'string' ||
      !parsed.refreshToken
    ) {
      return null;
    }
    return {
      appId: id,
      accountId: parsed.accountId,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

export function writeAppHandoffSession(value: StoredAppHandoffSession): void {
  const ls = readStorage();
  if (!ls) return;
  const appId = normalizeAppId(value.appId);
  if (!appId) return;
  ls.setItem(
    storageKey(appId),
    JSON.stringify({
      appId,
      accountId: value.accountId,
      refreshToken: value.refreshToken,
    })
  );
}

export function clearAppHandoffSession(appId: string): void {
  const id = normalizeAppId(appId);
  const ls = readStorage();
  if (!id || !ls) return;
  ls.removeItem(storageKey(id));
}
