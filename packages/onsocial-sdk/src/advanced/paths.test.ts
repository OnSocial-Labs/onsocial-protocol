import { describe, expect, it } from 'vitest';
import {
  PATH_DEFAULTS,
  RESERVED_PREFIXES,
  assertValidPaths,
  buildAppSetData,
  mergeSetData,
  paths,
  validatePath,
} from './paths.js';
import {
  buildCoreSetAction,
  buildOptions,
  buildRequest,
  prepareCoreRequest,
} from './actions.js';

describe('paths namespace', () => {
  it('builds app paths', () => {
    expect(paths.app('dating', 'profile', 'orientation')).toBe(
      'apps/dating/profile/orientation',
    );
    expect(paths.app('dating')).toBe('apps/dating');
  });

  it('builds group / profile / post / standing / reaction paths', () => {
    expect(paths.group('builders', 'post', 'p1')).toBe(
      'groups/builders/post/p1',
    );
    expect(paths.profile('name')).toBe('profile/name');
    expect(paths.profile()).toBe('profile');
    expect(paths.post('p1')).toBe('post/p1');
    expect(paths.standing('bob.near')).toBe('standing/bob.near');
    expect(paths.reaction('bob.near', 'like', 'post/123')).toBe(
      'reaction/bob.near/like/post/123',
    );
  });

  it('builds group content + group post paths under content/ namespace', () => {
    expect(paths.groupContent('builders')).toBe('groups/builders/content');
    expect(paths.groupContent('builders', 'event', 'meetup-7')).toBe(
      'groups/builders/content/event/meetup-7',
    );
    expect(paths.groupPost('builders', 'p1')).toBe(
      'groups/builders/content/post/p1',
    );
    expect(() => paths.groupPost('', 'p1')).toThrow();
    expect(() => paths.groupPost('g', '')).toThrow();
  });

  it('builds saved / endorsement / claim paths', () => {
    expect(paths.saved('bob.near/post/123')).toBe('saved/bob.near/post/123');
    expect(paths.endorsement('alice.near')).toBe('endorsement/alice.near');
    expect(paths.endorsement('alice.near', 'rust')).toBe(
      'endorsement/alice.near/rust',
    );
    expect(paths.claim('merchant.near', 'verified', 'cert-001')).toBe(
      'claims/merchant.near/verified/cert-001',
    );
  });

  it('throws on empty inputs to new helpers', () => {
    expect(() => paths.saved('')).toThrow();
    expect(() => paths.endorsement('')).toThrow();
    expect(() => paths.claim('', 'verified', 'x')).toThrow();
    expect(() => paths.claim('s', '', 'x')).toThrow();
    expect(() => paths.claim('s', 't', '')).toThrow();
  });

  it('throws on missing appId / groupId', () => {
    expect(() => paths.app('')).toThrow();
    expect(() => paths.group('')).toThrow();
  });
});

describe('validatePath', () => {
  it('accepts simple valid paths', () => {
    expect(validatePath('profile/name')).toBeNull();
    expect(validatePath('apps/dating/profile/orientation')).toBeNull();
    expect(validatePath('groups/builders/post/p1')).toBeNull();
    expect(validatePath('post/abc-123_v.2')).toBeNull();
  });

  it('rejects empty / leading-slash / depth / chars', () => {
    expect(validatePath('')).toBe('Invalid path length');
    expect(validatePath('/leading')).toBe('Invalid path format');
    expect(validatePath('a//b')).toBe('Invalid path format');
    expect(validatePath('a/../b')).toBe('Invalid path format');
    expect(validatePath('a/./b')).toBe('Invalid path format');
    expect(validatePath('a\\b')).toBe('Invalid path format');
    expect(validatePath('hello world')).toBe('Invalid path format');
    expect(validatePath('groups')).toBe('Invalid path format');
    expect(validatePath('groups/')).toBe('Invalid path format');
  });

  it('enforces max length and depth defaults', () => {
    const long = 'a/'.repeat(PATH_DEFAULTS.maxPathDepth + 1) + 'x';
    expect(validatePath(long)).toBe('Path depth exceeded');

    const huge = 'a'.repeat(PATH_DEFAULTS.maxKeyLength + 1);
    expect(validatePath(huge)).toBe('Invalid path length');
  });

  it('assertValidPaths throws on bad keys', () => {
    expect(() => assertValidPaths({ 'profile/name': 'ok' })).not.toThrow();
    expect(() =>
      assertValidPaths({ 'bad path': 'x' }),
    ).toThrow(/bad path/);
  });
});

describe('buildAppSetData', () => {
  it('prefixes every field with apps/<appId>/', () => {
    const data = buildAppSetData('dating', {
      'profile/orientation': 'queer',
      'match/bob.near': { liked: true },
    });
    expect(data).toEqual({
      'apps/dating/profile/orientation': 'queer',
      'apps/dating/match/bob.near': { liked: true },
    });
  });

  it('rejects empty appId', () => {
    expect(() => buildAppSetData('', { x: 1 })).toThrow();
  });

  it('composes with buildCoreSetAction for an arbitrary schema', () => {
    const action = buildCoreSetAction(
      buildAppSetData('marketplace', {
        'listing/abc': { price: '5', sku: 'X1' },
      }),
    );
    expect(action).toEqual({
      type: 'set',
      data: {
        'apps/marketplace/listing/abc': { price: '5', sku: 'X1' },
      },
    });
  });
});

describe('mergeSetData', () => {
  it('merges multiple builder outputs', () => {
    const out = mergeSetData([
      { 'profile/name': 'Alice' },
      { 'post/p1': { text: 'hi' } },
    ]);
    expect(out).toEqual({
      'profile/name': 'Alice',
      'post/p1': { text: 'hi' },
    });
  });

  it('throws on collision by default', () => {
    expect(() =>
      mergeSetData([{ 'a/b': 1 }, { 'a/b': 2 }]),
    ).toThrow(/Duplicate key/);
  });

  it('honors last/first wins modes', () => {
    expect(
      mergeSetData([{ 'a/b': 1 }, { 'a/b': 2 }], { onCollision: 'last' }),
    ).toEqual({ 'a/b': 2 });
    expect(
      mergeSetData([{ 'a/b': 1 }, { 'a/b': 2 }], { onCollision: 'first' }),
    ).toEqual({ 'a/b': 1 });
  });
});

describe('Options + Request envelope', () => {
  it('builds options object preserving only set fields', () => {
    expect(buildOptions({})).toEqual({});
    expect(buildOptions({ refund_unused_deposit: true })).toEqual({
      refund_unused_deposit: true,
    });
  });

  it('threads options through prepareCoreRequest', () => {
    const action = buildCoreSetAction({ 'profile/name': 'Alice' });
    const req = prepareCoreRequest(action, 'testnet', undefined, {
      refund_unused_deposit: true,
    });
    expect(req).toEqual({
      targetAccount: 'core.onsocial.testnet',
      action,
      options: { refund_unused_deposit: true },
    });
  });

  it('buildRequest constructs a full envelope', () => {
    const action = buildCoreSetAction({ 'profile/name': 'Alice' });
    const env = buildRequest({
      action,
      targetAccount: 'core.onsocial.testnet',
      options: { refund_unused_deposit: true },
    });
    expect(env).toEqual({
      action,
      target_account: 'core.onsocial.testnet',
      options: { refund_unused_deposit: true },
    });
  });

  it('reserved prefixes list documents app namespace convention', () => {
    expect(RESERVED_PREFIXES).toContain('apps/');
    expect(RESERVED_PREFIXES).toContain('groups/');
    expect(RESERVED_PREFIXES).toContain('saved/');
    expect(RESERVED_PREFIXES).toContain('endorsement/');
    expect(RESERVED_PREFIXES).toContain('claims/');
  });
});
