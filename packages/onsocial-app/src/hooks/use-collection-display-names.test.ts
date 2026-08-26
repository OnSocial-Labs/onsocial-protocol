import { describe, expect, it } from 'vitest';
import { collectionDisplayName } from '@/hooks/use-collection-display-names';

describe('collectionDisplayName', () => {
  it('prefers the catalog title', () => {
    expect(collectionDisplayName('Night Drive', 'night-drive')).toBe(
      'Night Drive'
    );
  });

  it('falls back to the collection id', () => {
    expect(collectionDisplayName('  ', 'night-drive')).toBe('night-drive');
    expect(collectionDisplayName(null, 'night-drive')).toBe('night-drive');
  });
});
