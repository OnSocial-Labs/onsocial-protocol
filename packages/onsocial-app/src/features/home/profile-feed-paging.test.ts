import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  beginProfileSectionFetch,
  emptyProfileSectionInFlight,
  endProfileSectionFetch,
} from '@/features/home/profile-feed-client';

const homeSrc = dirname(fileURLToPath(import.meta.url));

describe('profile feed section paging', () => {
  it('lets another tab begin while one section is in flight', () => {
    const inFlight = emptyProfileSectionInFlight();
    expect(beginProfileSectionFetch(inFlight, 'posts')).toBe(true);
    expect(beginProfileSectionFetch(inFlight, 'posts')).toBe(false);
    expect(beginProfileSectionFetch(inFlight, 'replies')).toBe(true);
    endProfileSectionFetch(inFlight, 'posts');
    expect(beginProfileSectionFetch(inFlight, 'posts')).toBe(true);
  });

  it('wires fetchSectionPage to the per-section lock helpers', () => {
    const source = readFileSync(join(homeSrc, 'profile-feed-client.tsx'), 'utf8');
    expect(source).toContain('beginProfileSectionFetch');
    expect(source).toContain('endProfileSectionFetch');
    expect(source).not.toMatch(
      /if \(sectionPagingRef\.current\) return;/
    );
  });
});
