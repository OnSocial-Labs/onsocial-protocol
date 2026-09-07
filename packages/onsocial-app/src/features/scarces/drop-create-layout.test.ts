import { describe, expect, it } from 'vitest';
import {
  DROP_CREATE_SECTION_ORDER,
  dropCreateScreenTitle,
} from '@/features/scarces/drop-create-layout';

describe('dropCreateScreenTitle', () => {
  it('keeps New drop unless the studio is open', () => {
    expect(dropCreateScreenTitle(false)).toBe('New drop');
    expect(dropCreateScreenTitle(true)).toBe('Design your set');
  });
});

describe('DROP_CREATE_SECTION_ORDER', () => {
  it('puts the work before the name, then the deal, then the blurb', () => {
    expect(DROP_CREATE_SECTION_ORDER).toEqual([
      'work',
      'title',
      'deal',
      'description',
    ]);
  });
});
