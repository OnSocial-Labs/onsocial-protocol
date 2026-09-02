import { describe, expect, it } from 'vitest';
import {
  profileAvatarClassName,
  profileAvatarShapeClassName,
  profileAvatarSizeClassName,
} from './profile-avatar.js';

describe('profileAvatarSizeClassName', () => {
  it('maps size tokens to css modifiers', () => {
    expect(profileAvatarSizeClassName('sm')).toBe('profile-avatar--sm');
    expect(profileAvatarSizeClassName('md')).toBe('profile-avatar--md');
    expect(profileAvatarSizeClassName('lg')).toBe('profile-avatar--lg');
  });
});

describe('profileAvatarShapeClassName', () => {
  it('keeps circle as the default look', () => {
    expect(profileAvatarShapeClassName('circle')).toBeUndefined();
    expect(profileAvatarShapeClassName('squircle')).toBe(
      'profile-avatar--squircle'
    );
    expect(profileAvatarShapeClassName('square')).toBe(
      'profile-avatar--square'
    );
  });
});

describe('profileAvatarClassName', () => {
  it('is stable', () => {
    expect(profileAvatarClassName).toBe('profile-avatar');
  });
});
