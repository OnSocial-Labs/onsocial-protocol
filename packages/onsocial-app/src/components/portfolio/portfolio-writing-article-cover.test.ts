import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(
  join(here, 'portfolio-writing-article-panel.tsx'),
  'utf8'
);

describe('article dateline', () => {
  it('sits under the rule as a calendar time, not in the title', () => {
    expect(panel).toContain('formatWritingShelfTimestamp');
    expect(panel).toContain('portfolio-writing-article-meta');
    expect(panel).toContain('portfolio-writing-dateline');
    expect(panel).toContain('dateTime={datelineIso}');
    expect(panel.indexOf('portfolio-writing-article-rule')).toBeLessThan(
      panel.indexOf('portfolio-writing-article-meta')
    );
    expect(panel.indexOf('portfolio-writing-dateline')).toBeLessThan(
      panel.indexOf('portfolio-writing-byline')
    );
  });
});

describe('article author stand', () => {
  it('puts Stand opposite the face, not like/save/share on the byline', () => {
    expect(panel).toContain('MediaFaceStandButton');
    expect(panel).toContain('portfolio-writing-article-stand');
    expect(panel.lastIndexOf('os-media-face-identity')).toBeLessThan(
      panel.lastIndexOf('MediaFaceStandButton')
    );
    expect(panel).toContain('portfolio-writing-article-author');
  });
});

describe('article place stack', () => {
  it('sends Writing and the author to the real pages with essay leave', () => {
    expect(panel).toContain('writingFromArticleHref');
    expect(panel).toContain('AccountPlaceLink');
    expect(panel).toContain('portfolioFromEssayPath');
    expect(panel).not.toContain('openWriting');
    expect(panel).not.toContain('interceptWriting');
    expect(panel).not.toContain('openFace');
    expect(panel).not.toContain('interceptFace');
  });
});

describe('article wake reply', () => {
  it('is Reply to the thread on the permalink footing', () => {
    expect(panel).toContain('aria-label="Reply"');
    expect(panel).toContain('personalPostPath');
    expect(panel).toContain('onReply');
    expect(panel).toContain('shareExtras');
  });
});

describe('article cover expand', () => {
  it('opens the shared cover overlay from the print, not feed cinema', () => {
    expect(panel).toContain('DropArtOverlay');
    expect(panel).toContain('aria-label="View cover"');
    expect(panel).toContain('setCoverOpen(true)');
    expect(panel).not.toContain('FeedPhotoEnlargeScreen');
  });
});
