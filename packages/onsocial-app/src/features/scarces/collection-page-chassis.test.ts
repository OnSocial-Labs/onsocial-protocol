import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('collection page chassis (CLS contract)', () => {
  it('seats author, fans, commerce meter, activity, and guest tally pending', () => {
    const panel = readFileSync(join(here, 'collection-page-panel.tsx'), 'utf8');
    const skeleton = readFileSync(
      join(here, 'collection-page-skeleton.tsx'),
      'utf8'
    );
    const guests = readFileSync(
      join(here, '../events/event-guests-sheet.tsx'),
      'utf8'
    );

    expect(panel).toContain('drops-discovery-by');
    expect(panel).toContain('collectionCreatorNameLine');
    expect(panel).not.toContain('creatorNameUnknown');
    expect(panel).toContain('DropFaceFans');
    expect(panel).toContain('has-fans-seat');
    expect(panel).toContain('collection-use-actions-trail-chassis');
    expect(panel).toContain('collection-use-actions-trail-ghost');
    expect(panel).toContain('collection-edition-trail');
    expect(panel).toContain('collection-meta-series-seat');
    expect(panel).toContain('collection-product-row');
    expect(panel).toContain('collection-progress');
    expect(panel).toContain('collection-activity-seat');
    expect(panel).toContain('collection-tracks-seat');
    expect(panel).toContain('collectionMediumBodyPending');
    expect(panel).toContain('CollectionTracksSkeleton');
    expect(panel).not.toContain('OsPageBodyAppear');
    expect(panel).toContain('OsLateFill');
    expect(panel).toContain('collection-about-seat');

    expect(skeleton).toContain('collection-product-row');
    expect(skeleton).toContain('collection-progress');
    expect(skeleton).toContain('collection-activity-seat');
    expect(skeleton).toContain('os-late-fill');
    expect(skeleton).toContain('collection-about-teaser');
    expect(skeleton).toContain('collection-guest-tally');
    expect(skeleton).not.toContain('collection-source-link');
    expect(skeleton).toContain('drops-discovery-party--lead');
    expect(panel).not.toContain('aria-label="Reading"');

    expect(guests).toContain('eventGuestSoldPrefix');
    expect(guests).toContain('collection-guest-tally-present');
  });
});