import { describe, expect, it } from 'vitest';
import { seriesPageDocumentTitle } from '@/lib/load-series-page';
import type { CollectionView } from '@/features/scarces/collections-data';
import type { SeriesBranding } from '@/features/scarces/series-data';

describe('seriesPageDocumentTitle', () => {
  it('prefers branding title, then drop series title, then id', () => {
    const branding = {
      title: 'Ink Studies',
    } as SeriesBranding;
    expect(seriesPageDocumentTitle(branding, [], 'ink')).toBe('Ink Studies');
    expect(
      seriesPageDocumentTitle(null, [
        { seriesTitle: 'Eggs' } as CollectionView,
      ], 'eggs')
    ).toBe('Eggs');
    expect(seriesPageDocumentTitle(null, [], 'raw-id')).toBe('raw-id');
  });
});
