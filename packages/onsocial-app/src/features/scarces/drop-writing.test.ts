import { describe, expect, it } from 'vitest';
import {
  buildWritingManifest,
  chapterTitleFromFile,
  isDropWritingMime,
  isLikelyIpfsCid,
  parseWritingFormat,
  parseWritingManifest,
  readablesFromManifest,
  writingChaptersValid,
  writingContentUrl,
} from '@/features/scarces/drop-writing';

function mdFile(name: string, type = 'text/markdown'): File {
  return new File(['# hi'], name, { type });
}

describe('isDropWritingMime', () => {
  it('accepts markdown and plain text', () => {
    expect(isDropWritingMime('text/markdown')).toBe(true);
    expect(isDropWritingMime('text/plain')).toBe(true);
    expect(isDropWritingMime('audio/mpeg')).toBe(false);
  });

  it('falls back to extension when mime is empty', () => {
    expect(isDropWritingMime('', 'chapter.md')).toBe(true);
    expect(isDropWritingMime('application/octet-stream', 'notes.txt')).toBe(
      true
    );
    expect(isDropWritingMime('', 'track.mp3')).toBe(false);
  });
});

describe('chapterTitleFromFile', () => {
  it('strips numeric prefixes and extensions', () => {
    expect(chapterTitleFromFile(mdFile('01-the-road.md'))).toBe('The road');
    expect(chapterTitleFromFile(mdFile('02_intro.markdown'))).toBe('Intro');
  });
});

describe('writingChaptersValid', () => {
  it('requires one file for article and 2–100 for book', () => {
    expect(writingChaptersValid('article', 1)).toBe(true);
    expect(writingChaptersValid('article', 2)).toBe(false);
    expect(writingChaptersValid('book', 1)).toBe(false);
    expect(writingChaptersValid('book', 2)).toBe(true);
    expect(writingChaptersValid('book', 50)).toBe(true);
    expect(writingChaptersValid('book', 100)).toBe(true);
    expect(writingChaptersValid('book', 101)).toBe(false);
  });
});

describe('parseWritingFormat', () => {
  it('parses known formats', () => {
    expect(parseWritingFormat('article')).toBe('article');
    expect(parseWritingFormat('Book')).toBe('book');
    expect(parseWritingFormat('album')).toBeNull();
  });
});

describe('writing manifesto', () => {
  it('builds and parses onsocial.writing.v1', () => {
    const built = buildWritingManifest({
      title: 'Novella',
      chapters: [
        { cid: 'bafychapteroneaaaaaaaaaaaaaaaaaa', mime: 'text/markdown', title: 'One' },
        { cid: 'bafychaptertwoaaaaaaaaaaaaaaaaaa', mime: 'text/markdown', title: 'Two' },
      ],
    });
    expect(built.format).toBe('onsocial.writing.v1');
    const parsed = parseWritingManifest(built);
    expect(parsed?.chapters).toHaveLength(2);
    expect(readablesFromManifest(parsed!).map((c) => c.title)).toEqual([
      'One',
      'Two',
    ]);
    expect(readablesFromManifest(parsed!)[0]?.url).toMatch(/^\/api\/ipfs\//);
  });

  it('rejects unknown manifesto formats', () => {
    expect(
      parseWritingManifest({ format: 'other', chapters: [] })
    ).toBeNull();
  });

  it('skips invalid chapter CIDs', () => {
    expect(
      parseWritingManifest({
        format: 'onsocial.writing.v1',
        chapters: [
          { cid: 'not-a-cid', mime: 'text/markdown', title: 'Bad' },
          {
            cid: 'bafychapteroneaaaaaaaaaaaaaaaaaa',
            mime: 'text/markdown',
            title: 'Good',
          },
        ],
      })?.chapters.map((c) => c.title)
    ).toEqual(['Good']);
  });
});

describe('writingContentUrl', () => {
  it('builds same-origin proxy URLs for CIDs', () => {
    expect(isLikelyIpfsCid('bafybeigabcdefghijklmnopqrstuv')).toBe(true);
    expect(writingContentUrl('bafybeigabcdefghijklmnopqrstuv')).toBe(
      '/api/ipfs/bafybeigabcdefghijklmnopqrstuv'
    );
    expect(writingContentUrl('not-a-cid')).toBeNull();
  });
});
