import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'thread-fold-button.tsx'), 'utf8');
const feedBlock = readFileSync(
  join(here, '../guilds/feed-thread-block.tsx'),
  'utf8'
);

const foldButton = source.slice(
  source.indexOf('export function ThreadFoldButton'),
  source.indexOf('function ThreadPostLink')
);
const coilTail = source.slice(source.indexOf('export function ThreadCoilTailLink'));

const postLink = source.slice(
  source.indexOf('function ThreadPostLink'),
  source.indexOf('export function ThreadFoldLink')
);

describe('ThreadPostLink', () => {
  it('opens the thread sheet on primary taps, like a card-body tap', () => {
    expect(postLink).toContain('usePostThreadLayer');
    expect(postLink).toContain('isUnmodifiedPrimaryClick(event)');
    expect(postLink).toContain('isAppPostSheetHref(href)');
    expect(postLink).toContain('openPostThread({ href, root, context })');
    expect(postLink).toContain('event.preventDefault();');
    expect(postLink).toContain('onNavigate={');
    expect(source.match(/openPostThread\(/g)).toHaveLength(1);
  });
});

describe('ThreadCoilTailLink', () => {
  it('uses the shared opener and keeps the coil permalink', () => {
    expect(coilTail).toContain('<ThreadPostLink');
    expect(coilTail).toContain('post-thread-more--coil-tail');
    expect(coilTail).toContain('ariaLabel="Open the rest of this thread"');
    expect(coilTail).not.toContain('openPostThread');
  });

  it('takes the peek post and feed context for instant sheet paint', () => {
    expect(coilTail).toContain('root?: PostRow | null');
    expect(coilTail).toContain('context?: ThreadSheetContext | null');
    expect(feedBlock).toMatch(
      /<ThreadCoilTailLink[\s\S]*?root=\{standingPeek\}[\s\S]*?context=\{sheetContext\}/
    );
  });
});

describe('ThreadFoldButton', () => {
  it('stays an in-place expander with no sheet navigation', () => {
    expect(foldButton).not.toContain('usePostThreadLayer');
    expect(foldButton).not.toContain('openPostThread');
    expect(foldButton).not.toContain('isAppPostSheetHref');
    expect(foldButton).toContain('<button');
    expect(foldButton).toContain('post-thread-more-coil');
  });
});

describe('ThreadFoldLink', () => {
  const foldLink = source.slice(
    source.indexOf('export function ThreadFoldLink'),
    source.indexOf('export function ThreadCoilTailLink')
  );

  it('opens the first post of the chain through the shared opener', () => {
    expect(foldLink).toContain('<ThreadPostLink');
    expect(foldLink).not.toContain('openPostThread');
    expect(feedBlock).toContain('ThreadFoldLink');
    expect(feedBlock).not.toContain('Show 1 earlier post');
    expect(feedBlock).not.toContain('setExpanded(true)');
    expect(feedBlock).toMatch(
      /<ThreadFoldLink[\s\S]*?root=\{block\[0\]\}[\s\S]*?context=\{sheetContext\}/
    );
  });
});
