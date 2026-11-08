import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const surfaceTokensCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-surface-interactive.css'),
  'utf8'
);
const sheetFactsCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-sheet-facts.css'),
  'utf8'
);
const floatingPanelCss = readFileSync(
  join(here, '../../../../onsocial-ui/floating-panel.css'),
  'utf8'
);
const feedClient = readFileSync(
  join(here, '../../features/home/profile-feed-client.tsx'),
  'utf8'
);
const rail = readFileSync(join(here, 'page-drawer-rail.tsx'), 'utf8');
const collection = readFileSync(
  join(here, 'page-drawer-collection.tsx'),
  'utf8'
);

describe('page drawer feed inset', () => {
  it('shares feed type on every viewport and only raises phone chrome', () => {
    expect(globalsCss).toMatch(
      /html \{\s*scrollbar-gutter: stable;\s*font-size: 100%;/
    );
    expect(globalsCss).toMatch(/--os-dock-bottom-offset:\s*0\.9rem;/);
    expect(globalsCss).toMatch(/--os-avatar-feed:\s*2\.5rem;/);
    /* Shared ladder — owned by @onsocial/ui, not re-mirrored in app :root. */
    expect(surfaceTokensCss).toMatch(/--os-identity-name-size:\s*0\.9375rem;/);
    expect(surfaceTokensCss).toMatch(/--os-identity-meta-size:\s*0\.875rem;/);
    expect(surfaceTokensCss).toMatch(
      /--os-identity-handle-size:\s*var\(--os-identity-meta-size\);/
    );
    expect(surfaceTokensCss).toMatch(
      /--os-identity-bio-size:\s*var\(--os-identity-meta-size\);/
    );
    expect(globalsCss).toMatch(
      /\.standing-row-bio \{[^}]*font-size:\s*var\(--os-identity-bio-size/
    );
    expect(surfaceTokensCss).toMatch(
      /--os-meta-size:\s*var\(--os-identity-meta-size\);/
    );
    expect(surfaceTokensCss).toMatch(/--os-stamp-size:\s*0\.75rem;/);
    expect(globalsCss).toMatch(
      /\.standing-row-time \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.market-listing-title \{[^}]*font-size:\s*var\(--os-identity-name-size/
    );
    expect(globalsCss).toMatch(
      /\.market-listing-meta \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(surfaceTokensCss).toMatch(
      /--os-control-label-size:\s*var\(--os-identity-meta-size/
    );
    expect(surfaceTokensCss).toMatch(
      /--os-control-label-sm-size:\s*var\(--os-stamp-size/
    );
    expect(surfaceTokensCss).toMatch(/--os-menu-glyph-size:\s*1\.125rem;/);
    expect(surfaceTokensCss).toMatch(/--os-menu-hit-size:\s*1\.35rem;/);
    expect(surfaceTokensCss).toMatch(
      /--os-engagement-glyph-size:\s*var\(--os-menu-glyph-size\);/
    );
    expect(surfaceTokensCss).toMatch(/--os-chrome-glyph-size:\s*1\.5rem;/);
    expect(globalsCss).toMatch(
      /\.post-card-menu-icon \{[^}]*width:\s*var\(--os-menu-glyph-size/
    );
    expect(globalsCss).toMatch(
      /\.post-card-stat svg,[\s\S]*?width:\s*var\(--os-engagement-glyph-size/
    );
    expect(globalsCss).toMatch(
      /\.post-card-relation \{[^}]*font-size:\s*0\.72rem/
    );
    expect(globalsCss).toMatch(
      /\.post-card-guild-name \{[^}]*font-size:\s*0\.68rem/
    );
    expect(globalsCss).toMatch(
      /\.collection-product-line \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.collection-section-label \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.collection-activity-standing-kind \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.guild-facepile-count \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.portfolio-handle \{[^}]*font-size:\s*var\(--os-identity-meta-size/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-section-title \{[^}]*font-size:\s*var\(--os-identity-name-size/
    );
    expect(globalsCss).toMatch(
      /\.guild-eyebrow \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.protocol-card-eyebrow \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.market-section-title \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.discover-tab-bar button \{[^}]*font-size:\s*var\(--os-control-label-sm-size/
    );
    expect(globalsCss).toMatch(
      /\.dao-info-lead \{[^}]*font-size:\s*var\(--os-identity-meta-size/
    );
    expect(globalsCss).toMatch(
      /\.home-feed-pull-copy \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.post-poll-footer \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).toMatch(
      /\.portfolio-boost-intro \{[^}]*font-size:\s*var\(--os-identity-meta-size/
    );
    expect(globalsCss).toMatch(
      /\.os-app-screen-title \{[^}]*font-size:\s*var\(--os-title-size/
    );
    expect(surfaceTokensCss).toMatch(/--os-title-size:\s*1\.05rem;/);
    expect(sheetFactsCss).toMatch(
      /\.os-sheet-facts-label \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(floatingPanelCss).toMatch(
      /\.os-floating-panel-trigger \{[^}]*font-size:\s*var\(--os-stamp-size/
    );
    expect(globalsCss).not.toMatch(
      /:root \{[^}]*--os-identity-name-size:\s*0\.9375rem;/
    );
    expect(globalsCss).toMatch(/--os-post-body-size:\s*1rem;/);
    expect(globalsCss).toMatch(/--os-post-body-leading:\s*1\.5;/);
    expect(globalsCss).toMatch(/--os-article-title-size:\s*1\.125rem;/);
    expect(globalsCss).toMatch(
      /--thread-avatar:\s*var\(--os-avatar-feed,\s*2\.5rem\);/
    );
    expect(globalsCss).toMatch(
      /--thread-rail-x:\s*calc\(var\(--thread-avatar\)\s*\/\s*2\);/
    );
    expect(globalsCss).toMatch(/--os-dock-height:\s*3\.25rem;/);
    expect(globalsCss).toMatch(/--os-icon-hit:\s*3\.25rem;/);
    expect(globalsCss).toMatch(/--os-control-primary:\s*3\.25rem;/);
    expect(globalsCss).toMatch(/--os-grip-width:\s*2\.625rem;/);
    expect(globalsCss).toMatch(/--os-avatar-nav:\s*1\.85rem;/);
    expect(globalsCss).toMatch(/--os-nav-band:\s*2\.35rem;/);
    expect(globalsCss).toMatch(
      /@media \(max-width: 639px\) \{[^}]*--os-grip-thickness:\s*0\.25rem;/
    );
    expect(globalsCss).not.toMatch(
      /@media \(max-width: 639px\) \{[^}]*--os-dock-height:/
    );
    expect(globalsCss).not.toMatch(
      /@media \(max-width: 639px\) \{[^}]*--os-post-body-size:/
    );
    expect(globalsCss).not.toMatch(/font-size:\s*0\.82em;/);
  });

  it('shares the gutter and derives dock clearance from the control box', () => {
    expect(globalsCss).toMatch(/--os-gutter:\s*0\.75rem;/);
    expect(globalsCss).toMatch(/--os-dock-height:\s*3\.25rem;/);
    expect(globalsCss).toMatch(
      /--portfolio-dock-clearance:\s*calc\(\s*var\(--os-dock-height\) \+ var\(--os-dock-bottom-offset\) \+\s*var\(--os-dock-clearance-gap\) \+ env\(safe-area-inset-bottom, 0px\)/
    );
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*1\.1rem;/);
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*1\.6rem;/);
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*0\.85rem;/);
  });

  it('uses the shared gutter on the page drawer', () => {
    expect(globalsCss).toMatch(
      /\.glass-sheet-root \.glass-sheet-panel\.page-drawer-panel \{[\s\S]*?height: 100%;[\s\S]*?max-height: none;[\s\S]*?--os-screen-body-pad-x: var\(--os-sheet-pad-inline, 0\.75rem\);/
    );
    expect(globalsCss).not.toMatch(
      /\.glass-sheet-root \.glass-sheet-panel\.page-drawer-panel \{[^}]*54rem/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-body \{[\s\S]*?padding: 0\.1rem var\(--os-screen-body-pad-x, 0\.75rem\) 0;/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-header \{[\s\S]*?padding: 0\.05rem var\(--os-screen-body-pad-x, 0\.75rem\) 0\.4rem;/
    );
  });

  it('does not wrap the profile feed in overlay panel-body', () => {
    expect(feedClient).not.toContain('panel-body');
    expect(feedClient).not.toContain('panel-placeholder');
    expect(feedClient).toContain('home-feed-state');
    expect(feedClient).toContain('className="home-feed-list"');
  });

  it('gives feed tabs the same dock scroll-end as scarces', () => {
    expect(rail).toContain('page-drawer-scroll-end');
    expect(rail).toMatch(
      /isProfileFeedTab\(tab\) \?[\s\S]*?page-drawer-scroll-end/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-scroll-end \{[\s\S]*?height: var\(--portfolio-dock-clearance, 5\.25rem\);/
    );
  });

  it('starts the collectibles preview on the vault row', () => {
    expect(collection).toContain('CollectiblesLibrarySkeleton');
    expect(collection).toContain('page-drawer-section is-vault');
    expect(collection).toContain('CollectiblesVaultLibrary');
    expect(collection).not.toContain('market-section-title');
    expect(collection).not.toContain('MarketListSkeleton');
    expect(globalsCss).toMatch(
      /\.page-drawer-section\.is-vault \{[\s\S]*?padding-top: 0;/
    );
  });

  it('opens the portfolio reply field at the dock column width', () => {
    expect(globalsCss).toMatch(
      /\.portfolio-summon-dock\.is-writing \.portfolio-summon-line \{\s*width: 100%;/
    );
  });

  it('lifts the reply pill above an open post sheet', () => {
    /* Flat :has() — nested :has() is dropped by browsers, which left the
       drawer dock under the post sheet. */
    expect(globalsCss).toMatch(
      /body:has\(\s*\.glass-sheet-root\[data-keep-dock='true'\]:not\(\.post-thread-sheet-parked\)\s*\.post-thread-sheet-panel\s*\):not\(:has\(\[data-os-slide-over='true'\]\[data-keep-dock='true'\]\)\)\s*\.portfolio-summon-dock \{\s*z-index: var\(--os-thread-dock-z, 51\);/
    );
  });

  it('uses dock clearance for keep-dock sheet bodies', () => {
    // Selector may head a shared rule (consolidated identical blocks):
    // assert it participates in a rule that applies the dock clearance.
    expect(globalsCss).toMatch(
      /\.glass-sheet-root\[data-keep-dock='true'\] \.glass-sheet-body(?=[^{}]*\{[^}]*?padding-bottom: var\(--portfolio-dock-clearance, 5\.25rem\);)/
    );
    expect(globalsCss).toMatch(
      /\.glass-sheet-root\[data-keep-dock='true'\] \.dao-proposals-page \.dao-workspace \{[\s\S]*?padding-bottom: calc\(1\.25rem \+ var\(--portfolio-dock-clearance, 5\.25rem\)\);/
    );
    expect(globalsCss).not.toContain(
      ".glass-sheet-root[data-keep-dock='true'] .dao-org-page .dao-org-page-content"
    );
  });
});
