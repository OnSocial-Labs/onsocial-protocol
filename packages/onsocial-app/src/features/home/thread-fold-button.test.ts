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
  source.indexOf('export function ThreadCoilTailLink')
);
const coilTail = source.slice(source.indexOf('export function ThreadCoilTailLink'));

describe('ThreadCoilTailLink', () => {
  it('opens the thread sheet on primary taps, like a card-body tap', () => {
    expect(coilTail).toContain('usePostThreadLayer');
    expect(coilTail).toContain('isUnmodifiedPrimaryClick(event)');
    expect(coilTail).toContain('isAppPostSheetHref(href)');
    expect(coilTail).toContain('openPostThread({ href, root, context })');
    expect(coilTail).toContain('event.preventDefault();');
    expect(coilTail).toContain('onNavigate={');
  });

  it('keeps the zigzag coil and the permalink fallback', () => {
    expect(coilTail).toContain('className="post-thread-more-coil"');
    expect(coilTail).toContain('post-thread-more--coil-tail');
    expect(coilTail).toContain('href={href}');
    expect(coilTail).toContain('aria-label="Open the rest of this thread"');
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
