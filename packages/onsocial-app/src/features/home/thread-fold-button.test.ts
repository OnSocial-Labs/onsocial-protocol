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
const personalPanel = readFileSync(
  join(here, 'live-personal-post-panel.tsx'),
  'utf8'
);
const guildPanel = readFileSync(
  join(here, '../guilds/live-guild-post-panel.tsx'),
  'utf8'
);

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

describe('reply fold', () => {
  it('opens the folded reply on its post page', () => {
    for (const panel of [personalPanel, guildPanel]) {
      expect(panel).toContain('ThreadFoldLink');
      expect(panel).toContain('row.hidden[0]');
      expect(panel).not.toContain('setExpandedBranches');
      expect(panel).not.toContain('ThreadFoldButton');
    }
    expect(personalPanel).toContain('href={postThreadPath(target)}');
    expect(guildPanel).toContain('context={sheetContext}');
  });
});

describe('ThreadFoldLink', () => {
  const foldLink = source.slice(source.indexOf('export function ThreadFoldLink'));

  it('opens the first post of the chain through the shared opener', () => {
    expect(foldLink).toContain('<ThreadPostLink');
    expect(foldLink).not.toContain('openPostThread');
    expect(feedBlock).toContain('ThreadFoldLink');
    expect(feedBlock).not.toContain('ThreadCoilTailLink');
    expect(feedBlock).not.toContain('Show 1 earlier post');
    expect(feedBlock).not.toContain('setExpanded(true)');
    expect(feedBlock).toMatch(
      /<ThreadFoldLink[\s\S]*?root=\{block\[0\]\}[\s\S]*?context=\{sheetContext\}/
    );
    expect(feedBlock).toMatch(
      /standingFoldLabel[\s\S]*<ThreadFoldLink[\s\S]*?root=\{standingTarget\}[\s\S]*?context=\{sheetContext\}[\s\S]*standingPeekRow/
    );
  });
});
