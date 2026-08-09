import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reorderByInsert } from '@/features/scarces/drop-track-order';
import { writingPinFingerprint } from '@/features/scarces/drop-pin-draft';
import {
  bookPdfFromManifest,
  bookPdfRefFromPinnedFile,
  buildWritingManifest,
  chapterTitleFromFile,
  chaptersFromPinnedFiles,
  isDropWritingChapterMime,
  isDropWritingMime,
  isLikelyIpfsCid,
  parseWritingFormat,
  parseWritingManifest,
  readWritingChapterIndex,
  readWritingScrollRatio,
  readablesFromManifest,
  writingChaptersValid,
  writingContentUrl,
  writingReadingSectionLabel,
  writingScrollRatioStorageKey,
  writeWritingChapterIndex,
  writeWritingScrollRatio,
} from '@/features/scarces/drop-writing';

function mdFile(name: string, type = 'text/markdown'): File {
  return new File(['# hi'], name, { type });
}

function pdfFile(name: string): File {
  return new File(['%PDF'], name, { type: 'application/pdf' });
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

describe('isDropWritingChapterMime', () => {
  it('allows PDF chapters for articles only', () => {
    expect(
      isDropWritingChapterMime('application/pdf', 'essay.pdf', 'article')
    ).toBe(true);
    expect(
      isDropWritingChapterMime('application/pdf', 'essay.pdf', 'book')
    ).toBe(false);
    expect(
      isDropWritingChapterMime('text/markdown', '01-road.md', 'book')
    ).toBe(true);
    expect(isDropWritingChapterMime('', 'notes.txt', 'book')).toBe(true);
    expect(isDropWritingChapterMime('', 'folio.pdf', 'book')).toBe(false);
  });
});

describe('chapterTitleFromFile', () => {
  it('strips numeric prefixes and extensions', () => {
    expect(chapterTitleFromFile(mdFile('01-the-road.md'))).toBe('The road');
    expect(chapterTitleFromFile(mdFile('02_intro.markdown'))).toBe('Intro');
    expect(chapterTitleFromFile(pdfFile('03-folio.pdf'))).toBe('Folio');
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
    expect(parsed?.bookPdf).toBeUndefined();
    expect(bookPdfFromManifest(parsed!)).toBeNull();
  });

  it('round-trips optional whole-book PDF without folding into chapters', () => {
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
      bookPdf: {
        cid: 'bafybookpdfaaaaaaaaaaaaaaaaaaaaa',
        mime: 'application/pdf',
        title: 'Print edition',
      },
    });
    expect(built.bookPdf?.cid).toBe('bafybookpdfaaaaaaaaaaaaaaaaaaaaa');
    const parsed = parseWritingManifest(built);
    expect(parsed?.chapters).toHaveLength(2);
    expect(parsed?.bookPdf?.mime).toBe('application/pdf');
    expect(readablesFromManifest(parsed!).map((c) => c.title)).toEqual([
      'One',
      'Two',
    ]);
    expect(bookPdfFromManifest(parsed!)?.cid).toBe(
      'bafybookpdfaaaaaaaaaaaaaaaaaaaaa'
    );
    expect(bookPdfFromManifest(parsed!)?.url).toMatch(/^\/api\/ipfs\//);
  });

  it('ignores non-PDF bookPdf and never folds it into chapters', () => {
    const parsed = parseWritingManifest({
      format: 'onsocial.writing.v1',
      chapters: [
        {
          cid: 'bafychapteroneaaaaaaaaaaaaaaaaaa',
          mime: 'text/markdown',
          title: 'One',
        },
      ],
      bookPdf: {
        cid: 'bafynotpdfaaaaaaaaaaaaaaaaaaaaaa',
        mime: 'text/markdown',
        title: 'Nope',
      },
    });
    expect(parsed?.bookPdf).toBeUndefined();
    expect(parsed?.chapters).toHaveLength(1);
    expect(bookPdfFromManifest(parsed!)).toBeNull();
  });

  it('omits bookPdf from build when mime is not PDF', () => {
    const built = buildWritingManifest({
      chapters: [
        {
          cid: 'bafychapteroneaaaaaaaaaaaaaaaaaa',
          mime: 'text/markdown',
        },
      ],
      bookPdf: {
        cid: 'bafynotpdfaaaaaaaaaaaaaaaaaaaaaa',
        mime: 'text/plain',
      },
    });
    expect(built.bookPdf).toBeUndefined();
  });

  it('builds bookPdf ref from a pinned PDF file', () => {
    const file = pdfFile('print-edition.pdf');
    expect(
      bookPdfRefFromPinnedFile(file, { cid: 'bafybookpdfaaaaaaaaaaaaaaaaaaaaa' })
    ).toEqual({
      cid: 'bafybookpdfaaaaaaaaaaaaaaaaaaaaa',
      mime: 'application/pdf',
      title: 'Print edition',
    });
    expect(
      bookPdfRefFromPinnedFile(mdFile('nope.md'), {
        cid: 'bafybookpdfaaaaaaaaaaaaaaaaaaaaa',
      })
    ).toBeNull();
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

describe('writingPinFingerprint', () => {
  it('includes bookPdf when present', () => {
    const cover = new File(['img'], 'cover.png', { type: 'image/png' });
    const chapters = [mdFile('01.md'), mdFile('02.md')];
    const bookPdf = pdfFile('book.pdf');
    const without = writingPinFingerprint({
      format: 'book',
      chapters,
      cover,
    });
    const withPdf = writingPinFingerprint({
      format: 'book',
      chapters,
      cover,
      bookPdf,
    });
    expect(withPdf).not.toBe(without);
    expect(withPdf).toContain(bookPdf.name);
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

describe('writingReadingSectionLabel', () => {
  it('labels chapter counts for the collection section', () => {
    expect(writingReadingSectionLabel(0)).toBe('Writing');
    expect(writingReadingSectionLabel(1)).toBe('1 chapter');
    expect(writingReadingSectionLabel(3)).toBe('3 chapters');
  });
});

describe('writing read progress storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists chapter index and per-chapter scroll ratio', () => {
    writeWritingChapterIndex('drop-1', 'alice.testnet', 2);
    expect(readWritingChapterIndex('drop-1', 'alice.testnet')).toBe(2);
    writeWritingScrollRatio('drop-1', 'alice.testnet', 2, 0.42);
    expect(readWritingScrollRatio('drop-1', 'alice.testnet', 2)).toBe(0.42);
    expect(readWritingScrollRatio('drop-1', 'alice.testnet', 0)).toBe(0);
    expect(
      writingScrollRatioStorageKey('drop-1', 'Alice.Testnet', 2)
    ).toBe('onsocial.writing.scroll:drop-1:alice.testnet:2');
  });

  it('no-ops without an account', () => {
    writeWritingChapterIndex('drop-1', null, 1);
    expect(readWritingChapterIndex('drop-1', null)).toBe(0);
  });
});
