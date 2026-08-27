import {
  generateEd25519Key,
  restoreEd25519Key,
  type GeneratedSessionKey,
} from './advanced/bootstrap.js';
import { normalizeAppId } from './auth-handoff.js';

export const APP_HANDOFF_KEY_PREFIX = 'onsocial.app.handoff.';

export type StoredAppHandoffKey = {
  appId: string;
  publicKey: string;
  secretSeedB64u: string;
  osOrigin: string;
};

function storageKey(appId: string): string {
  return `${APP_HANDOFF_KEY_PREFIX}${appId}`;
}

function readStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readAppHandoffKey(appId: string): StoredAppHandoffKey | null {
  const id = normalizeAppId(appId);
  const ls = readStorage();
  if (!id || !ls) return null;
  try {
    const raw = ls.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAppHandoffKey>;
    if (
      parsed.appId !== id ||
      typeof parsed.publicKey !== 'string' ||
      typeof parsed.secretSeedB64u !== 'string' ||
      typeof parsed.osOrigin !== 'string'
    ) {
      return null;
    }
    return {
      appId: id,
      publicKey: parsed.publicKey,
      secretSeedB64u: parsed.secretSeedB64u,
      osOrigin: parsed.osOrigin,
    };
  } catch {
    return null;
  }
}

export function clearAppHandoffKey(appId: string): void {
  const id = normalizeAppId(appId);
  const ls = readStorage();
  if (!id || !ls) return;
  ls.removeItem(storageKey(id));
}

export function writeAppHandoffKey(value: StoredAppHandoffKey): void {
  const ls = readStorage();
  if (!ls) {
    throw new Error('localStorage is required to start an OnSocial handoff');
  }
  ls.setItem(storageKey(value.appId), JSON.stringify(value));
}

/** Reuse a pending key for this app, or create one before redirecting to OS. */
export async function prepareAppHandoffKey(
  appId: string,
  osOrigin: string
): Promise<GeneratedSessionKey> {
  const id = normalizeAppId(appId);
  const origin = osOrigin.trim().replace(/\/$/, '');
  if (!id || !origin) {
    throw new Error('osOrigin and a valid appId are required');
  }
  const existing = readAppHandoffKey(id);
  if (existing) {
    const restored = await restoreEd25519Key(
      existing.secretSeedB64u,
      existing.publicKey
    );
    if (existing.osOrigin !== origin) {
      writeAppHandoffKey({ ...existing, osOrigin: origin });
    }
    return {
      publicKey: restored.publicKey,
      secretSeedB64u: existing.secretSeedB64u,
      sign: restored.sign,
    };
  }
  const generated = await generateEd25519Key();
  writeAppHandoffKey({
    appId: id,
    publicKey: generated.publicKey,
    secretSeedB64u: generated.secretSeedB64u,
    osOrigin: origin,
  });
  return generated;
}

export async function restoreAppHandoffSessionKey(
  appId: string
): Promise<GeneratedSessionKey | null> {
  const stored = readAppHandoffKey(appId);
  if (!stored) return null;
  const restored = await restoreEd25519Key(
    stored.secretSeedB64u,
    stored.publicKey
  );
  return {
    publicKey: restored.publicKey,
    secretSeedB64u: stored.secretSeedB64u,
    sign: restored.sign,
  };
}
