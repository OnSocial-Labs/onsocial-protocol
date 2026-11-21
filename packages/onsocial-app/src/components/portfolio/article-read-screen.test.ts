import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'article-read-screen.tsx'), 'utf8');
const list = readFileSync(join(here, 'portfolio-writing-panel.tsx'), 'utf8');
const feed = readFileSync(
  join(here, '../../features/home/feed-article-read-screen.tsx'),
  'utf8'
);
const postCard = readFileSync(
  join(here, '../../features/home/post-card.tsx'),
  'utf8'
);
const medium = readFileSync(
  join(here, '../../features/scarces/scarce-feed-medium-sheet.tsx'),
  'utf8'
);

describe('article reader core', () => {
  it('is one overlay for feed and Writing list, plus a matching permalink', () => {
    expect(screen).toContain('export function ArticleReadOverlay');
    expect(screen).toContain('export function ArticleReadPage');
    expect(screen).toContain('article-read-screen');
    expect(screen).not.toContain('portfolioMoodShellStyle');
    expect(screen).toContain('useArticleReadTrail');
    expect(screen).toContain('useArticleReadPlace');
    expect(screen).toContain('onBeforeClose');
    expect(feed).toContain('ArticleReadOverlay');
    expect(feed).toContain('engagement');
    expect(feed).toContain('scarce-post-medium-chrome');
  });

  it('keeps feed post controls on the feed overlay footer', () => {
    expect(feed).toContain('engagement');
    expect(feed).toContain('commerce');
  });
});

describe('writing list to article', () => {
  it('opens the overlay over the list instead of jumping to a solid page', () => {
    expect(list).toContain('ArticleReadOverlay');
    expect(list).toContain('onOpenArticle');
    expect(list).toContain('onReturnToShelf');
    expect(list).toContain('consumeEssayReopen');
    expect(list).not.toContain('leaveGlass');
  });
});

describe('overlay-idle leave', () => {
  it('holds article and medium trees until onClosed after the close slide', () => {
    expect(screen).toContain('onClosed={onClosed}');
    expect(feed).toContain('onClosed={onClosed}');
    expect(postCard).toContain('onClosed={articleScreen.onClosed}');
    expect(postCard).toContain('onClosed={feedMediumSheet.onClosed}');
    expect(postCard).not.toContain('articleScreen.onClosed()');
    expect(postCard).not.toContain('feedMediumSheet.onClosed()');
    expect(medium).toContain('onClosed={onClosed}');
    expect(medium).toContain('onListenClosed={onClosed}');
    expect(medium).not.toMatch(/if\s*\(\s*!open\s*\)\s*return\s*null/);
  });
});
