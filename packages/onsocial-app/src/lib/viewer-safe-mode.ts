/** Viewer Safe mode — hide NSFW / spoilers until revealed. Default ON. */

export const SAFE_MODE_STORAGE_KEY = 'onsocial.app.safe-mode';
export const SAFE_MODE_EVENT = 'onsocial:safemodechange';

export function readSafeMode(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SAFE_MODE_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch {
    // ignore
  }
  return true;
}

export function writeSafeMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAFE_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore persistence failures
  }
  window.dispatchEvent(new Event(SAFE_MODE_EVENT));
}

export function subscribeSafeMode(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(SAFE_MODE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SAFE_MODE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
