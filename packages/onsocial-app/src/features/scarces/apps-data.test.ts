import { describe, expect, it } from 'vitest';
import {
  creatorAccessLabel,
  creatorAccessShort,
} from '@/features/scarces/apps-data';

describe('hub creator access voice', () => {
  it('names the three doors as who can drop', () => {
    expect(creatorAccessShort('open')).toBe('Anyone');
    expect(creatorAccessShort('approval')).toBe('Approved');
    expect(creatorAccessShort('invite_only')).toBe('House');
  });

  it('explains each door in one line', () => {
    expect(creatorAccessLabel('open')).toBe('Anyone can drop');
    expect(creatorAccessLabel('approval')).toBe('Approved creators only');
    expect(creatorAccessLabel('invite_only')).toBe(
      'Only the house can publish'
    );
  });
});
