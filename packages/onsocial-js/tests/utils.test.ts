// tests/utils.test.ts
import { describe, it, expect } from 'vitest';
import { isValidAccountId, parsePath, buildPath } from '../src';

describe('isValidAccountId', () => {
  it('accepts valid account IDs', () => {
    expect(isValidAccountId('alice.near')).toBe(true);
    expect(isValidAccountId('bob.testnet')).toBe(true);
    expect(isValidAccountId('core.onsocial.testnet')).toBe(true);
    expect(isValidAccountId('user-123.near')).toBe(true);
    expect(isValidAccountId('app_v2.near')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isValidAccountId('a')).toBe(false);
    expect(isValidAccountId('')).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(isValidAccountId('Alice.near')).toBe(false);
    expect(isValidAccountId('UPPERCASE')).toBe(false);
  });

  it('rejects consecutive separators', () => {
    expect(isValidAccountId('double..dot')).toBe(false);
    expect(isValidAccountId('double--dash')).toBe(false);
    expect(isValidAccountId('double__underscore')).toBe(false);
  });

  it('rejects starting/ending with separator', () => {
    expect(isValidAccountId('.startdot')).toBe(false);
    expect(isValidAccountId('enddot.')).toBe(false);
    expect(isValidAccountId('-startdash')).toBe(false);
    expect(isValidAccountId('enddash-')).toBe(false);
  });
});

describe('parsePath', () => {
  it('parses type only', () => {
    expect(parsePath('profile')).toEqual({ type: 'profile', id: undefined, field: undefined });
  });

  it('parses type and id', () => {
    expect(parsePath('profile/name')).toEqual({ type: 'profile', id: 'name', field: undefined });
  });

  it('parses type, id, and field', () => {
    expect(parsePath('post/123/content')).toEqual({ type: 'post', id: '123', field: 'content' });
  });
});

describe('buildPath', () => {
  it('builds type only', () => {
    expect(buildPath('profile')).toBe('profile');
  });

  it('builds type and id', () => {
    expect(buildPath('profile', 'name')).toBe('profile/name');
  });

  it('builds type, id, and field', () => {
    expect(buildPath('post', '123', 'content')).toBe('post/123/content');
  });
});
