import { describe, expect, it } from 'vitest';
import {
  isProfileBioRangeHeading,
  isProfileBioRangeItalic,
  isProfileBioRangeList,
  profileAboutBlocks,
  splitProfileBioInlineDisplayRuns,
  toggleProfileBioHeading,
  toggleProfileBioItalic,
  toggleProfileBioList,
} from '@/lib/profile-bio-rich';

describe('toggleProfileBioItalic', () => {
  it('wraps a selection', () => {
    expect(toggleProfileBioItalic('hello world', 6, 11)).toEqual({
      text: 'hello *world*',
      start: 7,
      end: 12,
    });
  });

  it('unwraps when the caret is inside italic', () => {
    expect(toggleProfileBioItalic('hello *world*', 8, 8)).toEqual({
      text: 'hello world',
      start: 7,
      end: 7,
    });
  });

  it('does not treat bold markers as italic', () => {
    expect(toggleProfileBioItalic('see **you** later', 6, 9)).toEqual({
      text: 'see ***you*** later',
      start: 7,
      end: 10,
    });
  });
});

describe('splitProfileBioInlineDisplayRuns', () => {
  it('parses bold then italic', () => {
    expect(
      splitProfileBioInlineDisplayRuns('see **you** and *me* later')
    ).toEqual([
      { bold: false, italic: false, value: 'see ' },
      { bold: true, italic: false, value: 'you' },
      { bold: false, italic: false, value: ' and ' },
      { bold: false, italic: true, value: 'me' },
      { bold: false, italic: false, value: ' later' },
    ]);
  });
});

describe('isProfileBioRangeItalic', () => {
  it('is true only inside the inner run', () => {
    expect(isProfileBioRangeItalic('*hi*', 1, 3)).toBe(true);
    expect(isProfileBioRangeItalic('*hi*', 0, 1)).toBe(false);
    expect(isProfileBioRangeItalic('**hi**', 2, 4)).toBe(false);
  });
});

describe('toggleProfileBioHeading', () => {
  it('prefixes the current line', () => {
    expect(toggleProfileBioHeading('Hello\nthere', 0, 0)).toEqual({
      text: '# Hello\nthere',
      start: 2,
      end: 2,
    });
  });

  it('unwraps an existing heading', () => {
    expect(toggleProfileBioHeading('# Hello\nthere', 2, 2)).toEqual({
      text: 'Hello\nthere',
      start: 0,
      end: 0,
    });
  });
});

describe('toggleProfileBioList', () => {
  it('prefixes selected lines', () => {
    expect(toggleProfileBioList('one\ntwo', 0, 7)).toEqual({
      text: '- one\n- two',
      start: 2,
      end: 11,
    });
  });

  it('unwraps list lines', () => {
    expect(toggleProfileBioList('- one\n- two', 0, 11)).toEqual({
      text: 'one\ntwo',
      start: 0,
      end: 7,
    });
  });
});

describe('heading and list active ranges', () => {
  it('reads the current line', () => {
    expect(isProfileBioRangeHeading('# Hello\nthere', 3, 3)).toBe(true);
    expect(isProfileBioRangeHeading('#near\nthere', 1, 1)).toBe(false);
    expect(isProfileBioRangeList('- one\ntwo', 2, 2)).toBe(true);
    expect(isProfileBioRangeList('one\ntwo', 1, 1)).toBe(false);
  });
});

describe('profileAboutBlocks', () => {
  it('keeps blank-line paragraphs', () => {
    expect(
      profileAboutBlocks('First graph.\n\nSecond graph.\nStill second.')
    ).toEqual([
      { type: 'paragraph', text: 'First graph.' },
      { type: 'paragraph', text: 'Second graph.\nStill second.' },
    ]);
  });

  it('turns "# Title" into a heading and leaves #near as prose', () => {
    expect(
      profileAboutBlocks('# Work\n\nI build on #near.\n\n#near forever')
    ).toEqual([
      { type: 'heading', text: 'Work' },
      { type: 'paragraph', text: 'I build on #near.' },
      { type: 'paragraph', text: '#near forever' },
    ]);
  });

  it('groups dash lists and still allows italic in items', () => {
    expect(
      profileAboutBlocks('Before\n- one *two*\n- three\n\nAfter')
    ).toEqual([
      { type: 'paragraph', text: 'Before' },
      { type: 'list', items: ['one *two*', 'three'] },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  it('does not treat a lone hash or empty dash as structure', () => {
    expect(profileAboutBlocks('#\n- \nOnly one.')).toEqual([
      { type: 'paragraph', text: '#' },
      { type: 'paragraph', text: 'Only one.' },
    ]);
  });
});
