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

describe('article reader core', () => {
  it('is one overlay for feed and Writing list, plus a matching permalink', () => {
    expect(screen).toContain('export function ArticleReadOverlay');
    expect(screen).toContain('export function ArticleReadPage');
    expect(screen).toContain('article-read-screen');
    expect(screen).not.toContain('portfolioMoodShellStyle');
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
