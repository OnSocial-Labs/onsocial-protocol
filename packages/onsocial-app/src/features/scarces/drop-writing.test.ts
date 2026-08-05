import { describe, expect, it } from 'vitest';
import { reorderByInsert } from '@/features/scarces/drop-track-order';
import {
  buildWritingManifest,
  chapterTitleFromFile,
  chaptersFromPinnedFiles,
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
  it('accepts markdown, plain text, and PDF', () => {
    expect(isDropWritingMime('text/markdown')).toBe(true);
    expect(isDropWritingMime('text/plain')).toBe(true);
    expect(isDropWritingMime('application/pdf')).toBe(true);
    expect(isDropWritingMime('audio/mpeg')).toBe(false);
  });

  it('falls back to extension when mime is empty', () => {
    expect(isDropWritingMime('', 'chapter.md')).toBe(true);
    expect(isDropWritingMime('application/octet-stream', 'notes.txt')).toBe(
      true
    );
    expect(isDropWritingMime('', 'zine.pdf')).toBe(true);
    expect(isDropWritingMime('', 'track.mp3')).toBe(false);
  });
});

describe('chapterTitleFromFile', () => {
  it('strips numeric prefixes and extensions', () => {
    expect(chapterTitleFromFile(mdFile('01-the-road.md'))).toBe('The road');
    expect(chapterTitleFromFile(mdFile('02_intro.markdown'))).toBe('Intro');
    expect(
      chapterTitleFromFile(new File(['%PDF'], '03-folio.pdf', { type: 'application/pdf' }))
    ).toBe('Folio');
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
        {
          cid: 'bafychapteroneaaaaaaaaaaaaaaaaaa',
          mime: 'text/markdown',
          title: 'One',
        },
        {
          cid: 'bafychaptertwoaaaaaaaaaaaaaaaaaa',
          mime: 'text/markdown',
          title: 'Two',
        },
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

  it('pins manifesto chapters in the post-reorder UI order', () => {
    const picked = [
      mdFile('01-prologue.md'),
      mdFile('02-the-road.md'),
      mdFile('03-night.md'),
    ];
    // Drag prologue to the end — same helper the chapter list uses.
    const chapterFiles = reorderByInsert(picked, 0, 3);
    expect(chapterFiles.map((f) => f.name)).toEqual([
      '02-the-road.md',
      '03-night.md',
      '01-prologue.md',
    ]);

    // uploadMany returns one CID per file, same index order as the array.
    const uploaded = [
      { cid: 'bafyroadchapteraaaaaaaaaaaaaaaaa' },
      { cid: 'bafynightchapteraaaaaaaaaaaaaaa' },
      { cid: 'bafyprologuechapteraaaaaaaaaaaa' },
    ];
    const chapters = chaptersFromPinnedFiles(chapterFiles, uploaded);
    const manifesto = buildWritingManifest({
      title: 'Novella',
      chapters,
    });

    expect(manifesto.chapters.map((c) => c.title)).toEqual([
      'The road',
      'Night',
      'Prologue',
    ]);
    expect(manifesto.chapters.map((c) => c.cid)).toEqual([
      'bafyroadchapteraaaaaaaaaaaaaaaaa',
      'bafynightchapteraaaaaaaaaaaaaaa',
      'bafyprologuechapteraaaaaaaaaaaa',
    ]);
  });
});

describe('writingContentUrl', () => {
  it('builds same-origin proxy URLs for CIDs', () => {
    expect(isLikelyIpfsCid('bafybeigabcdefghijklmnopqrstuv')).toBe(true);
    expect(isLikelyIpfsCid('bafkreigdabcdefghijklmnopqrstuvwx')).toBe(true);
    expect(writingContentUrl('bafybeigabcdefghijklmnopqrstuv')).toBe(
      '/api/ipfs/bafybeigabcdefghijklmnopqrstuv'
    );
    expect(writingContentUrl('not-a-cid')).toBeNull();
  });
});
