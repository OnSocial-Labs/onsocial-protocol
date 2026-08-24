import { describe, expect, it } from 'vitest';
import {
  linkNotesEqual,
  pruneLinkNotes,
  sanitizeLinkNotes,
} from './page-launch-config';

describe('sanitizeLinkNotes', () => {
  it('trims and drops empty notes', () => {
    expect(
      sanitizeLinkNotes({
        website: '  Weekly essays  ',
        x: '   ',
      })
    ).toEqual({ website: 'Weekly essays' });
  });
});

describe('pruneLinkNotes', () => {
  it('keeps titles only for filled links', () => {
    expect(
      pruneLinkNotes(
        { website: 'My website', github: 'Code', x: 'Birds' },
        { website: 'example.com', github: '', x: 'alice' }
      )
    ).toEqual({ website: 'My website', x: 'Birds' });
  });
});

describe('linkNotesEqual', () => {
  it('treats trimmed equivalent maps as equal', () => {
    expect(
      linkNotesEqual({ website: '  Home  ' }, { website: 'Home' })
    ).toBe(true);
    expect(linkNotesEqual({ website: 'Home' }, { github: 'Code' })).toBe(
      false
    );
  });
});
