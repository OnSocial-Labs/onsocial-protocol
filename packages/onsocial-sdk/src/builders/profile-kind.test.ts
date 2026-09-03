import { describe, expect, it } from 'vitest';
import { buildProfileSetData } from './profile.js';
import {
  PROFILE_FACE_KIND_OPTIONS,
  PROFILE_KIND_OPTIONS,
  editorFaceKind,
  normalizeProfileKindInput,
  parseProfileKind,
  profileAvatarShapeForFace,
  profileAvatarShapeFromKind,
  profileKindFaceLabel,
  profileKindFromMaterialised,
  resolveDisplayProfileKind,
} from './profile-kind.js';

describe('parseProfileKind', () => {
  it('accepts the three v1 kinds, case-insensitive', () => {
    expect(parseProfileKind('person')).toBe('person');
    expect(parseProfileKind('ORG')).toBe('org');
    expect(parseProfileKind(' Dao ')).toBe('dao');
  });

  it('rejects unknown values', () => {
    expect(parseProfileKind('business')).toBeUndefined();
    expect(parseProfileKind('')).toBeUndefined();
    expect(parseProfileKind(null)).toBeUndefined();
    expect(parseProfileKind(1)).toBeUndefined();
  });
});

describe('normalizeProfileKindInput', () => {
  it('returns null for empty or invalid input', () => {
    expect(normalizeProfileKindInput('')).toBeNull();
    expect(normalizeProfileKindInput('team')).toBeNull();
    expect(normalizeProfileKindInput(null)).toBeNull();
  });

  it('keeps valid kinds', () => {
    expect(normalizeProfileKindInput('org')).toBe('org');
  });
});

describe('profileKindFromMaterialised', () => {
  it('prefers reserved kind over extra', () => {
    expect(
      profileKindFromMaterialised({
        kind: 'org',
        extra: { kind: 'dao' },
      })
    ).toBe('org');
  });

  it('falls back to extra.kind', () => {
    expect(profileKindFromMaterialised({ extra: { kind: 'dao' } })).toBe('dao');
  });

  it('returns undefined when missing', () => {
    expect(profileKindFromMaterialised(null)).toBeUndefined();
    expect(profileKindFromMaterialised({ extra: {} })).toBeUndefined();
  });
});

describe('resolveDisplayProfileKind', () => {
  it('treats omit as person', () => {
    expect(resolveDisplayProfileKind()).toBe('person');
    expect(resolveDisplayProfileKind(undefined, false)).toBe('person');
  });

  it('lets the DAO workspace win over a stored kind', () => {
    expect(resolveDisplayProfileKind(undefined, true)).toBe('dao');
    expect(resolveDisplayProfileKind('person', true)).toBe('dao');
    expect(resolveDisplayProfileKind('org', true)).toBe('dao');
  });

  it('treats stored dao as person when the account is not a DAO workspace', () => {
    expect(resolveDisplayProfileKind('dao')).toBe('person');
  });
});

describe('profileAvatarShapeFromKind + face label', () => {
  it('maps person / omit → circle, org → squircle, dao → square', () => {
    expect(profileAvatarShapeFromKind()).toBe('circle');
    expect(profileAvatarShapeFromKind('person')).toBe('circle');
    expect(profileAvatarShapeFromKind('org')).toBe('squircle');
    expect(profileAvatarShapeFromKind('dao')).toBe('square');
    expect(
      new Set([
        profileAvatarShapeFromKind('person'),
        profileAvatarShapeFromKind('org'),
        profileAvatarShapeFromKind('dao'),
      ]).size
    ).toBe(3);
  });

  it('squares every DAO workspace face', () => {
    expect(profileAvatarShapeForFace(undefined, true)).toBe('square');
    expect(profileAvatarShapeForFace('org', true)).toBe('square');
    expect(profileAvatarShapeForFace('person', true)).toBe('square');
  });

  it('labels org and dao only', () => {
    expect(profileKindFaceLabel('person')).toBeNull();
    expect(profileKindFaceLabel('org')).toBe('Organization');
    expect(profileKindFaceLabel('dao')).toBe('DAO');
  });

  it('exposes schema kinds and person/org editor chips', () => {
    expect(PROFILE_KIND_OPTIONS.map((option) => option.value)).toEqual([
      'person',
      'org',
      'dao',
    ]);
    expect(PROFILE_FACE_KIND_OPTIONS.map((option) => option.value)).toEqual([
      'person',
      'org',
    ]);
    expect(editorFaceKind('dao')).toBe('person');
    expect(editorFaceKind('org')).toBe('org');
  });
});

describe('buildProfileSetData kind', () => {
  it('writes profile/kind as a plain string', () => {
    expect(buildProfileSetData({ kind: 'org' })).toEqual({
      'profile/v': '1',
      'profile/kind': 'org',
    });
  });

  it('tombstones kind with null', () => {
    expect(buildProfileSetData({ kind: null })).toEqual({
      'profile/v': '1',
      'profile/kind': null,
    });
  });

  it('does not write kind when omitted', () => {
    expect(buildProfileSetData({ name: 'Alice' })).toEqual({
      'profile/v': '1',
      'profile/name': 'Alice',
    });
  });
});
