import { describe, expect, it } from 'vitest';
import {
  COLLECTIBLES_HELD_KINDS_COOKIE,
  collectiblesVaultAccountFromPathname,
  cookieValueFromCookieSource,
  parseCollectiblesHeldKindsCookie,
  resolveCollectiblesHeldKinds,
  serializeCollectiblesHeldKinds,
} from '@/lib/collectibles-held-kinds';

describe('collectibles held-kinds cookie', () => {
  it('round-trips an owner vault and ignores another account', () => {
    const raw = serializeCollectiblesHeldKinds('Alice.near', [
      'all',
      'writing',
      'audio',
      'ticket',
    ]);
    expect(parseCollectiblesHeldKindsCookie(raw, 'alice.near')).toEqual([
      'all',
      'writing',
      'audio',
      'ticket',
    ]);
    expect(
      parseCollectiblesHeldKindsCookie(encodeURIComponent(raw), 'alice.near')
    ).toEqual(['all', 'writing', 'audio', 'ticket']);
    expect(parseCollectiblesHeldKindsCookie(raw, 'bob.near')).toBeNull();
    expect(parseCollectiblesHeldKindsCookie('', 'alice.near')).toBeNull();
  });

  it('reads the held-kinds cookie from a document.cookie string', () => {
    const raw = serializeCollectiblesHeldKinds('alice.near', [
      'all',
      'writing',
      'audio',
    ]);
    const source = `other=1; ${COLLECTIBLES_HELD_KINDS_COOKIE}=${encodeURIComponent(raw)}`;
    expect(
      parseCollectiblesHeldKindsCookie(
        cookieValueFromCookieSource(source, COLLECTIBLES_HELD_KINDS_COOKIE),
        'alice.near'
      )
    ).toEqual(['all', 'writing', 'audio']);
  });

  it('uses remembered kinds until inventory arrives', () => {
    const remembered = parseCollectiblesHeldKindsCookie(
      serializeCollectiblesHeldKinds('alice.near', [
        'all',
        'writing',
        'audio',
      ]),
      'alice.near'
    );
    expect(
      resolveCollectiblesHeldKinds({
        items: [],
        selected: 'audio',
        accountId: 'alice.near',
        seedHeldKinds: remembered,
      })
    ).toEqual(['all', 'writing', 'audio']);
    expect(
      resolveCollectiblesHeldKinds({
        items: [{ mediumKind: 'ticket' }],
        selected: 'audio',
        accountId: 'alice.near',
        seedHeldKinds: remembered,
      })
    ).toEqual(['all', 'audio', 'ticket']);
  });

  it('parses the portfolio vault path and ignores play / OS', () => {
    expect(
      collectiblesVaultAccountFromPathname('/@Alice.near/collectibles')
    ).toBe('Alice.near');
    expect(
      collectiblesVaultAccountFromPathname(
        '/@greenghost.onsocial.testnet/collectibles/'
      )
    ).toBe('greenghost.onsocial.testnet');
    expect(collectiblesVaultAccountFromPathname('/collectibles')).toBeNull();
    expect(
      collectiblesVaultAccountFromPathname('/@alice.near/collectibles/play')
    ).toBeNull();
  });
});
