import { describe, expect, it } from 'vitest';
import {
  HUB_CREATE_ADD_BANNER,
  HUB_CREATE_ADD_LOGO,
  hubCreateAboutToggle,
} from '@/features/scarces/hub-create-voice';

describe('hubCreateAboutToggle', () => {
  it('says Add, Edit, or Hide — one name, About', () => {
    expect(hubCreateAboutToggle({ open: false, hasText: false })).toBe(
      'Add about'
    );
    expect(hubCreateAboutToggle({ open: false, hasText: true })).toBe(
      'Edit about'
    );
    expect(hubCreateAboutToggle({ open: true, hasText: false })).toBe(
      'Hide about'
    );
    expect(hubCreateAboutToggle({ open: true, hasText: true })).toBe(
      'Hide about'
    );
  });

  it('names look tools Banner and Logo, not Cover or Crest', () => {
    expect(HUB_CREATE_ADD_BANNER).toBe('Add banner');
    expect(HUB_CREATE_ADD_LOGO).toBe('Add logo');
  });
});
