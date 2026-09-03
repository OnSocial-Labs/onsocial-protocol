import { describe, expect, it } from 'vitest';
import {
  isProfileBioRangeBold,
  splitProfileBioBoldDisplayRuns,
  toggleProfileBioBold,
} from '@/lib/profile-bio-bold';

describe('toggleProfileBioBold', () => {
  it('wraps a selection', () => {
    expect(toggleProfileBioBold('hello world', 6, 11)).toEqual({
      text: 'hello **world**',
      start: 8,
      end: 13,
    });
  });

  it('unwraps when the caret is inside bold', () => {
    expect(toggleProfileBioBold('hello **world**', 10, 10)).toEqual({
      text: 'hello world',
      start: 8,
      end: 8,
    });
  });

  it('inserts a bold nest when there is no selection', () => {
    expect(toggleProfileBioBold('hi ', 3, 3)).toEqual({
      text: 'hi ****',
      start: 5,
      end: 5,
    });
  });

  it('does not wrap past the cap', () => {
    expect(toggleProfileBioBold('hi', 0, 2, 4)).toEqual({
      text: 'hi',
      start: 0,
      end: 2,
    });
  });
});

describe('splitProfileBioBoldDisplayRuns', () => {
  it('hides markers and keeps the inner run', () => {
    expect(splitProfileBioBoldDisplayRuns('see **you** later')).toEqual([
      { bold: false, value: 'see ' },
      { bold: true, value: 'you' },
      { bold: false, value: ' later' },
    ]);
  });
});

describe('isProfileBioRangeBold', () => {
  it('is true only inside the inner run', () => {
    expect(isProfileBioRangeBold('**hi**', 2, 4)).toBe(true);
    expect(isProfileBioRangeBold('**hi**', 0, 2)).toBe(false);
  });
});
