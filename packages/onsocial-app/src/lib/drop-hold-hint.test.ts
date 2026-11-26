import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_DROP_HOLD_HINT_COOKIE,
  clearDropHoldHintCookie,
  dropHoldHintForCollection,
  forgetDropHoldHint,
  parseDropHoldHint,
  rememberDropHoldHint,
  serializeDropHoldHint,
} from '@/lib/drop-hold-hint';

describe('drop hold hint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips held and settled-miss entries', () => {
    const raw = serializeDropHoldHint({
      accountId: 'alice.near',
      entries: new Map([
        ['night-drive', 'night-drive:3'],
        ['empty-pass', ''],
      ]),
    });
    expect(raw).toBe('alice.near~night-drive:night-drive:3,empty-pass:');
    const state = parseDropHoldHint(raw);
    expect(state?.accountId).toBe('alice.near');
    expect(state?.entries.get('night-drive')).toBe('night-drive:3');
    expect(state?.entries.get('empty-pass')).toBe('');
    expect(
      dropHoldHintForCollection(raw, 'Alice.near', 'night-drive')
    ).toEqual({
      holds: true,
      tokenId: 'night-drive:3',
    });
    expect(
      dropHoldHintForCollection(raw, 'alice.near', 'empty-pass')
    ).toEqual({
      holds: false,
      tokenId: null,
    });
    expect(dropHoldHintForCollection(raw, 'alice.near', 'missing')).toBeNull();
    expect(dropHoldHintForCollection(raw, 'bob.near', 'night-drive')).toBeNull();
  });

  it('writes and forgets through document.cookie', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('document', {
      get cookie() {
        return [...store.entries()]
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      },
      set cookie(value: string) {
        const [pair] = value.split(';');
        const eq = pair.indexOf('=');
        const key = pair.slice(0, eq).trim();
        const raw = pair.slice(eq + 1).trim();
        if (value.includes('Max-Age=0')) store.delete(key);
        else store.set(key, raw);
      },
    });
    rememberDropHoldHint('alice.near', 'night-drive', 'night-drive:3');
    expect(store.has(APP_DROP_HOLD_HINT_COOKIE)).toBe(true);
    expect(
      dropHoldHintForCollection(
        decodeURIComponent(store.get(APP_DROP_HOLD_HINT_COOKIE)!),
        'alice.near',
        'night-drive'
      )
    ).toEqual({ holds: true, tokenId: 'night-drive:3' });
    forgetDropHoldHint('alice.near', 'night-drive');
    expect(store.has(APP_DROP_HOLD_HINT_COOKIE)).toBe(false);
    rememberDropHoldHint('alice.near', 'solo', 'solo:1');
    clearDropHoldHintCookie();
    expect(store.has(APP_DROP_HOLD_HINT_COOKIE)).toBe(false);
  });
});
