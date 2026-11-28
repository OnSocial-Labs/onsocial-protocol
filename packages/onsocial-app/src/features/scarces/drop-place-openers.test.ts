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
  it('opens the shared drop sheet with warm seed (PR 859 DropLayerSheet)', () => {
    const open = src('features/scarces/drop-place-open.tsx');
    expect(open).toContain('export function DropPlaceLink');
    expect(open).toContain('export function useDropPlaceOpen');
    expect(open).toContain('export function navigateDropPlace');
    expect(open).toContain('export function warmDropPlaceOpen');
    expect(open).toContain('export function resolveDropOpenSeed');
    expect(open).toContain('readCollectionView');
    expect(open).toContain('seedDropLoveFaceFromList');
    expect(open).toContain('fanCount');
    expect(open).toContain('usePostThreadLayer');
    expect(open).toContain('openDrop');
    expect(open).toContain('rememberCollectionView');
    expect(open).toMatch(/<a\b/);
    expect(open).not.toMatch(/from 'next\/link'/);
    expect(open).not.toContain('armDropPlaceInstant');
    expect(open).not.toContain('router.push');
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
    expect(src('features/market/market-listing-row.tsx')).toContain(
      'fanCount={item.fanCount}'
    );
    const drops = src('features/drops/drops-page-panel.tsx');
    expect(drops).toContain('DropPlaceLink');
    expect(drops).toContain('market-listing-row-open');
    // Thumb is part of the place link — no list listen/read/artwork sheet.
    expect(drops).not.toContain('onOpenCover');
    expect(drops).not.toContain('ScarceFeedMediumSheet');
    expect(drops).not.toContain('dropsListCoverAction');
  });

  it('seeds list fan face into place open when counts exist', () => {
    expect(src('features/drops/drops-page-panel.tsx')).toContain('fanCount=');
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'fanCount={fanCount}'
    );
    expect(src('components/portfolio/portfolio-drop-row.tsx')).toContain(
      'fanIds={drop.fanIds}'
    );
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

  it('drop place has no route loading — the sheet owns the open', () => {
    const loading = src('features/scarces/collection-route-loading.tsx');
    expect(loading).not.toContain('CollectionPagePanel');
    expect(loading).not.toContain('CollectionPageSkeleton');
    expect(loading).not.toContain('readCollectionView');
    expect(loading).toContain('CollectionChildLoadingScreen');
    expect(loading).toContain('Door / redeem route loading only');
    const open = src('features/scarces/drop-place-open.tsx');
    expect(open).toContain('openDrop');
    expect(open).not.toContain('armDropPlaceInstant');
    const layer = src('features/home/post-thread-layer.tsx');
    expect(layer).toContain('DropLayerSheet');
    expect(layer).toContain('presentation="appear"');
    expect(layer).toContain('keepDock');
    expect(layer).toContain('useClaimDropSheetDockBack');
    expect(layer).toContain('data-drop-layer-sheet');
    // Drop above a keep-dock media face (reply drawer) must publish dock z —
    // posts already did; excluding `kind === 'drop'` left Mint under the sheet.
    expect(layer).not.toContain("top.kind !== 'drop'");
    expect(layer).toContain('--os-thread-dock-z');
    expect(layer).toContain('dropLayerOpenHistoryOp');
    expect(layer).toContain("op === 'push'");
    expect(layer).toContain('nativeHistoryPushState');
    expect(layer).toContain('nativeHistoryReplaceState');
    // DropLayerSheet is a sibling of `children` under PostThreadLayer — the
    // now-playing host must wrap that layer or soft-open audio dies on close.
    const providers = src('components/providers/app-providers.tsx');
    const nowPlayingAt = providers.indexOf('<CollectiblesNowPlayingProvider>');
    const postLayerAt = providers.indexOf('<PostThreadLayerProvider>');
    expect(nowPlayingAt).toBeGreaterThanOrEqual(0);
    expect(postLayerAt).toBeGreaterThan(nowPlayingAt);
    const css = src('app/globals.css');
    // Scroll chain + dock hit target. Root keepDock pad zeroed so short
    // drops do not grow an empty footer; scrollport keeps dock clearance.
    expect(css).toContain(
      'glass-sheet-panel.drop-sheet-panel\n  .os-app-screen--embedded'
    );
    expect(css).toContain(
      ".glass-sheet-root[data-keep-dock='true']:has(.drop-sheet-panel)"
    );
    expect(css).toMatch(
      /drop-sheet-panel[\s\S]{0,200}?portfolio-summon-dock[\s\S]{0,80}?portfolio-summon/
    );
    // Soft drop restores dock without requiring a keep-dock media-face :has
    // (CTA from the reply drawer). Fallback clears a face-lifted sheet (~170).
    expect(css).toContain('--os-thread-dock-z, 171');
    // Restore must match tuck (`.os-app-screen >`) or Read→Drop hides Mint.
    expect(css).toMatch(
      /drop-sheet-panel\s*\)\s*\.os-app-screen\s*>\s*\.portfolio-summon-dock/
    );
    expect(css).toMatch(
      /drop-sheet-panel\s*\)\s*\.portfolio-os-layer\s*>\s*\.portfolio-summon-dock/
    );
    // Writing / article Read faces keep dock while soft drop is up.
    expect(
      src('features/scarces/scarce-writing-read-sheet.tsx')
    ).toContain('writePinned || threadOpen || dropSheetOpen');
    expect(
      src('components/portfolio/article-read-screen.tsx')
    ).toContain('writePinned || threadOpen || dropSheetOpen');
    // Medium / photo faces: quiet off while soft Drop owns the pill.
    expect(src('features/scarces/scarce-feed-medium-sheet.tsx')).toContain(
      '!threadOpen && !dropSheetOpen'
    );
    expect(src('features/home/feed-photo-enlarge-screen.tsx')).toContain(
      '!threadOpen && !dropSheetOpen'
    );
    expect(layer).toContain("top?.kind === 'drop' && isOsMediaFaceOpen()");
    expect(layer).toContain(
      'Math.max(dock ?? SHEET_Z.launcher, rendered + 1)'
    );
    expect(layer).toContain('setOsDropSheetOpen');
    // Covered media faces must not clear dock via aboveDock (overlay stack).
    expect(src('../../onsocial-ui/src/overlay-stack.ts')).toContain(
      'index === last && !entry.keepDock'
    );
    // Soft drop claims compose (Mint or blank) so underlay pen / reply write
    // cannot sit on the pill. Nested reply → drop also re-reveals the pill.
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('useClaimDropSheetCompose');
    expect(panel).toContain('embedded && !suspendDock');
    // Close/unmount must pop Mint or stars stay on the feed dock.
    // Pop only in a dedicated unmount effect — not claim-effect cleanup
    // (that looped setState: pop → claim → pop).
    expect(src('contexts/compose-launcher-context.tsx')).toContain(
      "return () => popCompose(DROP_SHEET_COMPOSE_ID)"
    );
    expect(src('contexts/compose-launcher-context.tsx')).toContain(
      'if (!current.some((row) => row.id === id)) return current'
    );
    expect(src('contexts/compose-launcher-context.tsx')).toContain(
      "type: 'blank'"
    );
    // Cold chunk: await warm before open; pending jacket only while module loads.
    expect(open).toContain('warmDropPanel().then');
    expect(layer).toContain('ensurePostPanelChunk');
    expect(layer).toContain('warmFeedOpenChunks');
    expect(layer).not.toContain('warmFeedOpenChunksIdle');
    expect(layer).toContain('DropLayerPanelPending');
    expect(layer).toContain('suspendDock={parked || !open}');
    expect(src('features/scarces/drop-layer-panel-pending.tsx')).toContain(
      'useClaimDropSheetCompose(true, null)'
    );
    expect(src('contexts/dock-chrome-context.tsx')).toContain(
      'requestDockReveal'
    );
    // Open reveals a scroll-hidden pill once via epoch (register / claim).
    expect(src('contexts/dock-chrome-context.tsx')).toContain(
      'requestDockReveal?.()'
    );
    expect(src('components/os/summon-launcher.tsx')).toContain(
      'dockRevealEpoch'
    );
    expect(src('components/portfolio/portfolio-summon-dock.tsx')).toContain(
      'dockRevealEpoch'
    );
    expect(src('hooks/use-dock-auto-hide.ts')).toContain('revealRequest');
    const page = src('app/(app)/collection/[collectionId]/page.tsx');
    expect(page).toContain('CollectionRouteSlot');
    expect(page).toContain("headerList.get('next-url')");
    expect(page).toContain('return null');
    expect(page).not.toContain('yieldToHost');
    expect(page).not.toContain('DropPlaceInstantHost');
    expect(page).not.toContain("get('rsc')");
    expect(src('components/providers/app-providers.tsx')).not.toContain(
      'DropPlaceInstantHost'
    );
    expect(layer).toContain('__osOpenUncachedDrop');
  });

  it('docked drop sheet owns dock Back; player uses header chevron', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    expect(panel).toContain('dockBack={dockBackOn}');
    expect(panel).toContain('useRegisterComposeAction');
    expect(panel).toContain('useClaimDropSheetCompose');
    expect(panel).toContain("isOwner ? 'announce' : 'mint'");
    expect(panel).toContain('seededHotOpen');
    expect(panel).toContain('readCollectionView');
    expect(panel).toContain('suspendDock');
    expect(panel).toContain('softFillArmed');

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
    expect(panel).toContain('collection-title-shimmer');
    expect(panel).toContain('className="collection-title"');
    expect(panel).not.toContain('collection-about-seat" fade');
    // Face chrome is never gated — only nested sheets wait on overlayReady.
    expect(panel).toContain('{overlayReady ? (');
    expect(panel).toContain('<CollectionAboutSheet');
    expect(panel.indexOf('collection-use-actions')).toBeLessThan(
      panel.indexOf('{overlayReady ? (')
    );
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

  it('sheet owns appear — face never stagger-rises under the open', () => {
    const panel = src('features/scarces/collection-page-panel.tsx');
    const open = src('features/scarces/drop-place-open.tsx');
    const layer = src('features/home/post-thread-layer.tsx');
    const screen = src('components/app/os-app-screen.tsx');
    expect(panel).not.toContain('CollectionPageReveal');
    expect(panel).not.toContain('coldHandoff');
    expect(panel).not.toContain('bodyAppear');
    expect(panel).toContain('seededHotOpen ? (');
    expect(panel).not.toContain('OsPageBodyAppear');
    expect(panel).toContain('CollectionShowPassTrail');
    expect(open).toContain('warmOwnedCollectionHold');
    expect(panel).toContain('peekDropFaceHoldSeed');
    expect(panel).toContain('reservePassPlayRow');
    expect(panel).toContain('const enterOn = false');
    expect(panel).not.toContain('dropEnterShouldPlay');
    expect(panel).toContain('OsRouteSettle');
    expect(layer).toContain('presentation="appear"');
    expect(screen).not.toContain('bodyAppear');
    expect(screen).not.toContain('OsRouteSettle');
  });
});
