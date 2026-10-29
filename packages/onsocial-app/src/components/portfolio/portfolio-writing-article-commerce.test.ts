import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const commerce = readFileSync(
  join(here, 'portfolio-writing-article-commerce.tsx'),
  'utf8'
);
const postCard = readFileSync(
  join(here, '../../features/home/post-card.tsx'),
  'utf8'
);
const cta = readFileSync(
  join(here, '../../features/scarces/post-scarce-cta.tsx'),
  'utf8'
);

function sheetBlock(source: string, name: string): string {
  const start = source.indexOf(`<${name}`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, start + 500);
}

describe('article reader commerce', () => {
  it('opens mint, buy, and bid sheets above the reader', () => {
    expect(commerce).toContain('onBuy={() => setBuyOpen(true)}');
    expect(commerce).toContain('onBid={() => setBidOpen(true)}');
    expect(commerce).toContain('<ScarceBuySheet');
    expect(commerce).toContain('<ScarceBidSheet');
    expect(sheetBlock(commerce, 'ScarceBuySheet')).toContain(
      'zIndex={actionZ}'
    );
    expect(sheetBlock(commerce, 'ScarceBidSheet')).toContain(
      'zIndex={actionZ}'
    );
    expect(commerce).not.toContain('router.push');
    expect(commerce).not.toContain('collectionPath');
  });

  it('opens sell and transfer on the same layer as buy', () => {
    expect(commerce).toContain('onSell={() => setSellOpen(true)}');
    expect(commerce).toContain('onTransfer={() => setTransferOpen(true)}');
    expect(sheetBlock(commerce, 'ScarceSellSheet')).toContain(
      'zIndex={actionZ}'
    );
    expect(sheetBlock(commerce, 'ScarceTransferSheet')).toContain(
      'zIndex={actionZ}'
    );
    expect(sheetBlock(postCard, 'ScarceSellSheet')).toContain(
      'zIndex={actionZ}'
    );
    expect(sheetBlock(postCard, 'ScarceTransferSheet')).toContain(
      'zIndex={actionZ}'
    );
  });

  it('keeps Drop, Hub, and Market as navigation', () => {
    expect(cta).toContain("label: 'Drop'");
    expect(cta).toContain("label: 'Hub'");
    expect(cta).toContain("label: 'Market'");
    expect(cta).toContain('linksBesideDropAction');
    expect(cta).toContain("link.label !== 'Drop'");
    expect(cta).not.toContain('Open Drop');
    expect(cta).toContain('collectionPath(collectionId)');
    expect(cta).toContain('marketCreatorPath');
    expect(cta).not.toContain('seriesPagePath');
    expect(cta).not.toContain("label: embed.seriesTitle?.trim() || 'Series'");
  });
});
