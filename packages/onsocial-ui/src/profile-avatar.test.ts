import { describe, expect, it } from 'vitest';
import {
  profileAvatarClassName,
  profileAvatarSizeClassName,
} from './profile-avatar.js';

describe('profileAvatarSizeClassName', () => {
  it('maps size tokens to css modifiers', () => {
    expect(profileAvatarSizeClassName('sm')).toBe('profile-avatar--sm');
    expect(profileAvatarSizeClassName('md')).toBe('profile-avatar--md');
    expect(profileAvatarSizeClassName('lg')).toBe('profile-avatar--lg');
  });
});

describe('profileAvatarClassName', () => {
  it('is stable', () => {
    expect(profileAvatarClassName).toBe('profile-avatar');
  });
});
