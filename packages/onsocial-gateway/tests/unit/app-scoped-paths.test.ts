import { describe, expect, it } from 'vitest';
import {
  appScopedSetPathError,
  appScopedSetPathsError,
  appScopedSignedDelegateError,
  extractSetDataKeysFromSignedDelegate,
} from '../../src/services/app-scoped-paths.js';

describe('appScopedSetPathError', () => {
  it('allows first-party social and the bound app namespace', () => {
    expect(appScopedSetPathError('post/hello', 'tracker')).toBeNull();
    expect(appScopedSetPathError('profile/name', 'tracker')).toBeNull();
    expect(appScopedSetPathError('apps/tracker/item/1', 'tracker')).toBeNull();
    expect(
      appScopedSetPathError('alice.testnet/apps/tracker/item/1', 'tracker')
    ).toBeNull();
  });

  it('blocks another app namespace and unknown roots', () => {
    expect(appScopedSetPathError('apps/dating/item/1', 'tracker')).toMatch(
      /apps\/tracker/
    );
    expect(appScopedSetPathError('mygame/score', 'tracker')).toMatch(
      /cannot write/
    );
  });
});

describe('appScopedSetPathsError', () => {
  it('allows a mixed social + own-app batch', () => {
    expect(
      appScopedSetPathsError(['profile/name', 'apps/tracker/item/1'], 'tracker')
    ).toBeNull();
  });

  it('rejects a batch that touches another app', () => {
    expect(
      appScopedSetPathsError(['profile/name', 'apps/dating/item/1'], 'tracker')
    ).toMatch(/apps\/tracker/);
  });
});

describe('signed delegate set extraction', () => {
  function embedSet(data: Record<string, unknown>): string {
    const json = JSON.stringify({ type: 'set', data });
    return Buffer.from(`xxxx${json}yyyy`, 'utf8').toString('base64');
  }

  it('reads Set keys from a signed-delegate payload', () => {
    expect(
      extractSetDataKeysFromSignedDelegate(
        embedSet({
          'apps/tracker/item/1': { hello: true },
          'profile/name': 'Alice',
        })
      )
    ).toEqual(['apps/tracker/item/1', 'profile/name']);
  });

  it('fences a foreign app write hidden in a batch Set', () => {
    expect(
      appScopedSignedDelegateError(
        embedSet({
          'profile/name': 'Alice',
          'apps/dating/item/1': { stolen: true },
        }),
        'tracker'
      )
    ).toMatch(/apps\/tracker/);
  });

  it('passes through non-Set delegates', () => {
    const blob = Buffer.from(
      JSON.stringify({ type: 'mint', token_id: '1' }),
      'utf8'
    ).toString('base64');
    expect(appScopedSignedDelegateError(blob, 'tracker')).toBeNull();
  });
});
