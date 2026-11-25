import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = join(here, '../..');

function src(rel: string): string {
  return readFileSync(join(appSrc, rel), 'utf8');
}

/** Drop = place (dock); use surfaces = header chevron. */
describe('Drop place openers', () => {
  it('soft-navs with warm seed — does not open the appear layer by default', () => {
    const open = src('features/scarces/drop-place-open.tsx');
    expect(open).toContain('export function DropPlaceLink');
    expect(open).toContain('export function useDropPlaceOpen');
    expect(open).toContain('export function navigateDropPlace');
    expect(open).toContain('export function warmDropPlaceOpen');
    expect(open).toContain('export function resolveDropOpenSeed');
    expect(open).toContain('readCollectionView');
    expect(open).toContain('scroll: false');
    expect(open).toContain("kind: 'full'");
    expect(open).toContain('rememberCollectionView');
    expect(open).toMatch(/<a\b/);
    expect(open).not.toMatch(/from 'next\/link'/);
    expect(open).not.toContain('DropOverlayLink');
    expect(open).not.toContain('useDropOverlayOpen');
  });

  it('resolves solid list view, else remembered catalog, else thin seed', () => {
    const open = src('features/scarces/drop-place-open.tsx');
    expect(open).toContain('cached ?? initial');
    expect(open).toContain('resolveDropOpenSeed');
  });

  it('opens Discover Just sold as the full drop place (dock Mint)', () => {
    expect(src('features/scarces/drop-place-open.tsx')).not.toContain(
      'DropAppearLink'
    );
    expect(src('features/scarces/drop-place-open.tsx')).not.toContain(
      'useDropAppearOpen'
    );
    expect(src('features/discover/discover-moving-peeks.tsx')).toContain(
      'DropPlaceLink'
    );
    expect(src('features/discover/discover-moving-peeks.tsx')).not.toContain(
      'DropAppearLink'
    );
  });

  it('opens creator listing + portfolio drops as full places', () => {
    expect(src('features/market/market-creator-drop-row.tsx')).toContain(
      'DropPlaceLink'
    );
    expect(src('features/market/market-creator-drop-row.tsx')).toContain(
      'market-listing-row-open'
    );
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'market-listing-row-open'
    );
  });

  it('opens Market rows and Drops list as full places', () => {
    expect(src('features/market/market-sale-row.tsx')).toContain(
      'DropPlaceLink'
    );
    expect(src('features/market/market-listing-row.tsx')).toContain(
      'DropPlaceLink'
    );
    const drops = src('features/drops/drops-page-panel.tsx');
    expect(drops).toContain('DropPlaceLink');
    expect(drops).toContain('market-listing-row-open');
    // Thumb is part of the place link — no list listen/read/artwork sheet.
    expect(drops).not.toContain('onOpenCover');
    expect(drops).not.toContain('ScarceFeedMediumSheet');
    expect(drops).not.toContain('dropsListCoverAction');
  });

  it('passes list creator face into the place seed like Drops', () => {
    expect(src('features/scarces/drop-place-open.tsx')).toContain(
      'initialCreator'
    );
    expect(src('features/scarces/drop-place-open.tsx')).toContain(
      'rememberCollectionCreatorFace'
    );
    expect(src('features/drops/drops-page-panel.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/market/market-listing-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/market/market-sale-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/market/market-creator-drop-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/market/market-owned-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/scarces/post-scarce-cta.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'seedCollectionViewFromStoreDrop'
    );
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/collectibles/collectibles-holding-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('features/discover/discover-catalog-results.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
    expect(src('components/launcher-home/launcher-peek-row.tsx')).toContain(
      'initialCreator={dropCreator}'
    );
  });

  it('Events prefers solid list view like Drops', () => {
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'item.view ??'
    );
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
  });

  it('vault, owned, and edition follow soft-nav to the drop place', () => {
    const vault = src('features/collectibles/collectibles-holding-row.tsx');
    expect(vault).toContain('opensDropPage');
    expect(vault).toContain('DropPlaceLink');
    expect(vault).toContain('holdingsPlayHref');

    const owned = src('features/market/market-owned-row.tsx');
    expect(owned).toContain('opensDropPage');
    expect(owned).toContain('DropPlaceLink');
    expect(owned).toContain('holdingsPlayHref');

    const edition = src('features/collectibles/held-edition-follow.tsx');
    expect(edition).toContain('useDropPlaceOpen');
    expect(edition).toContain("destination.type === 'play'");
    expect(edition).toContain('openDrop({');
    expect(edition).not.toContain('router.push(heldEditionBrowseHref');
  });

  it('seeds Events, Discover catalog, Collectibles drop opens, and hub peeks', () => {
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
    expect(src('features/discover/discover-catalog-results.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
    expect(src('features/collectibles/collectibles-holding-row.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
    expect(src('features/scarces/hubs-latest-drops-panel.tsx')).toContain(
      'seedCollectionViewFromPeek'
    );
  });

  it('routes play View drop, notifications, create success, facts, and door sheet through place open', () => {
    expect(src('features/collectibles/collectibles-play-panel.tsx')).toContain(
      'useDropPlaceOpen'
    );
    expect(src('features/collectibles/collectibles-play-panel.tsx')).toContain(
      'initialCreator: collectionCreatorFaceSeed'
    );
    expect(src('features/notifications/notifications-panel.tsx')).toContain(
      'useDropPlaceOpen'
    );
    expect(src('features/scarces/create-drop-panel.tsx')).toContain(
      'useDropPlaceOpen'
    );
    expect(src('features/scarces/scarce-listing-facts-sheet.tsx')).toContain(
      'DropPlaceLink'
    );
    expect(src('features/scarces/ticket-door-event-sheet.tsx')).toContain(
      'DropPlaceLink'
    );
    expect(src('features/scarces/ticket-door-event-sheet.tsx')).not.toMatch(
      /from 'next\/link'/
    );
  });

  it('warms the drop chunk on Market, Drops, Events, and Collectibles', () => {
    expect(src('features/market/market-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
    expect(src('features/drops/drops-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
    expect(src('features/events/events-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
    expect(src('features/collectibles/collectibles-page-panel.tsx')).toContain(
      'warmDropPanel'
    );
  });

  it('route loading paints the real seeded drop panel — no stand-in shell', () => {
    const loading = src('features/scarces/collection-route-loading.tsx');
    expect(loading).toContain('readCollectionView');
    expect(loading).toContain('CollectionPagePanel');
    expect(loading).not.toContain('CollectionPlaceHotShell');
    expect(loading).toContain('dockBack');
    expect(loading).toContain('CollectionPageSkeleton');
  });

  it('full drop place owns dock Back; player uses header chevron', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('dockBack={!embedded}');
    expect(panel).toContain('useRegisterComposeAction');
    expect(panel).toContain("isOwner ? 'announce' : 'mint'");
    expect(panel).toContain('seededHotOpen');
    expect(panel).toContain('readCollectionView');

    const play = src('features/collectibles/collectibles-play-panel.tsx');
    expect(play).toContain('OsHeaderBack');
    expect(play).toContain('dockBack={false}');

    const playLoading = src(
      'features/collectibles/collectibles-play-loading-screen.tsx'
    );
    expect(playLoading).toContain('OsHeaderBack');
    expect(playLoading).toContain('dockBack={false}');
  });

  it('seeded hot place never returns CollectionPageSkeleton', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('seededHotOpen');
    expect(panel).toContain('liveView ?? initial ?? null');
    expect(panel).toContain("catalogShell === 'skeleton' && !seededHotOpen");
    expect(panel).toContain('OsRouteSettle');
    expect(panel).toContain('readDropFirstPaint');
    expect(panel).toContain('useState(() => liveView != null)');
    expect(panel).toContain('needsAllowlist && !isOwner && isConnected');
    expect(panel).not.toContain('walletLoading || isConnected');
    expect(panel).toContain('seededHotOpen ? (');
  });

  it('always paints supply + progress on the drop face (no use-first hide)', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('collection-progress');
    expect(panel).toContain('collection-product-row');
    expect(panel).not.toContain('showCommerceMeter');
    expect(panel).not.toContain('collectionShowCommerceMeter');
  });

  it('reserves activity and ticket event lines; soft-fill holds the tracks seat', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('collection-activity-seat');
    expect(panel).toContain('DropFaceFans');
    expect(src('components/drops/drop-row-fans.tsx')).toContain(
      'collection-drop-fans--chassis'
    );
    expect(panel).toContain('collection-tracks-seat');
    expect(panel).toContain('collectionShowInlineTracks');
    expect(panel).toContain('collectionMediumBodyPending');
    expect(panel).toContain('CollectionTracksSkeleton');
    expect(panel).toContain('catalogFacePending');
    expect(panel).toContain('collection-skeleton-title');
    expect(panel).toContain('isTicketKind');
    expect(panel).toContain('productStatus');
    expect(panel).not.toContain('showCollectiblesEarly');
  });

  it('cold skeleton paints the same commerce chassis as the settled face', () => {
    const skeleton = src('features/scarces/collection-page-skeleton.tsx');
    expect(skeleton).toContain('collection-product-row');
    expect(skeleton).toContain('collection-progress');
    expect(skeleton).toContain('collection-commerce-actions');
    expect(skeleton).toContain('drops-discovery-party--lead');
    expect(skeleton).toContain('collection-activity-seat');
  });

  it('seeded drop stays opaque; cold settle does not use a page-wide appear', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    const screen = src('components/app/os-app-screen.tsx');
    expect(panel).not.toContain('CollectionPageReveal');
    expect(panel).not.toContain('OsPageBodyAppear');
    expect(panel).not.toContain('coldHandoff');
    expect(panel).not.toContain('bodyAppear');
    expect(panel).toContain('dropEnterShouldPlay');
    expect(panel).toContain('OsRouteSettle');
    expect(screen).not.toContain('bodyAppear');
    expect(screen).not.toContain('OsRouteSettle');
  });
});
