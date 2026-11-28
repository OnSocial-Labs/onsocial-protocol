import { describe, expect, it } from 'vitest';
import {
  readerChapterHeading,
  stripLeadingRepeatedHeading,
  writingUntitledLabel,
} from '@/features/scarces/writing-read-voice';

describe('writingUntitledLabel', () => {
  it('says Writing, not Manuscript', () => {
    expect(writingUntitledLabel()).toBe('Writing');
    expect(writingUntitledLabel({ isPdf: true })).toBe('PDF');
  });
});

describe('readerChapterHeading', () => {
  it('does not repeat the masthead title', () => {
    expect(
      readerChapterHeading({
        chapterTitle: 'Night drive',
        workTitle: 'night drive',
        isBook: false,
      })
    ).toBeNull();
    expect(
      readerChapterHeading({
        chapterTitle: 'Night drive',
        workTitle: 'Night drive',
        isBook: true,
        untitledBookLabel: 'Chapter 1',
      })
    ).toBeNull();
  });

  it('keeps a chapter name that differs from the work', () => {
    expect(
      readerChapterHeading({
        chapterTitle: 'Departure',
        workTitle: 'Night drive',
        isBook: true,
      })
    ).toBe('Departure');
  });

  it('names an untitled book chapter and skips an untitled essay', () => {
    expect(
      readerChapterHeading({
        chapterTitle: '',
        workTitle: 'Night drive',
        isBook: true,
        untitledBookLabel: 'Chapter 2',
      })
    ).toBe('Chapter 2');
    expect(
      readerChapterHeading({
        chapterTitle: '',
        workTitle: 'Night drive',
        isBook: false,
        untitledBookLabel: 'Chapter 1',
      })
    ).toBeNull();
  });
});

describe('stripLeadingRepeatedHeading', () => {
  it('drops a leading heading that repeats a title already shown', () => {
    expect(
      stripLeadingRepeatedHeading('# Night drive\n\nThe road was empty.', [
        'Night drive',
      ])
    ).toBe('The road was empty.');
  });

  it('keeps a heading that is a new section', () => {
    const body = '## The river\n\nAfter dark.';
    expect(stripLeadingRepeatedHeading(body, ['Night drive'])).toBe(body);
  });
});
