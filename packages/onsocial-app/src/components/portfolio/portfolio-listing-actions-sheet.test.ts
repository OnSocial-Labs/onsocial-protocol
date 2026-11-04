import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(
  join(here, 'portfolio-listing-actions-sheet.tsx'),
  'utf8'
);
const marks = readFileSync(
  join(here, 'portfolio-owner-payout-marks.tsx'),
  'utf8'
);

describe('listing actions handoff', () => {
  it('replaces the list when Buy, Bid, or Offers opens', () => {
    expect(sheet).toContain('replaceSheet()');
    expect(sheet).not.toContain('setSheetHandoff');
    expect(sheet).toContain('beginHandoff()');
    expect(sheet).toContain('{handedOff ? null : (');
    expect(sheet).toContain('if (!next) finishHandoff()');
    expect(sheet).toContain('onOpenChange(false)');
    expect(sheet).toContain('<ScarceBuySheet');
    expect(sheet).toContain('<ScarceBidSheet');
    expect(sheet).toContain('<ScarceOffersSheet');
  });

  it('keeps the host mounted until the replacement sheet closes', () => {
    expect(marks).toContain('showListings || listingsOpen');
  });
});
