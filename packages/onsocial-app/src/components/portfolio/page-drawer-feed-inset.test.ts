import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
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
  it('raises the phone scale without moving the dock or the gutter', () => {
    expect(globalsCss).toMatch(
      /html \{\s*scrollbar-gutter: stable;\s*font-size: 100%;/
    );
    expect(globalsCss).toMatch(/--os-dock-bottom-offset:\s*0\.9rem;/);
    expect(globalsCss).toMatch(
      /@media \(max-width: 639px\) \{\s*:root \{\s*--os-dock-height:\s*3rem;/
    );
    expect(globalsCss).toMatch(/--os-grip-width:\s*2\.5rem;/);
    expect(globalsCss).toMatch(/--os-grip-thickness:\s*0\.25rem;/);
    expect(globalsCss).toMatch(/--os-post-body-size:\s*1rem;/);
    expect(globalsCss).toMatch(/--os-identity-name-size:\s*0\.9375rem;/);
    expect(globalsCss).toMatch(/--os-identity-meta-size:\s*0\.875rem;/);
    expect(globalsCss).toMatch(/--os-meta-size:\s*0\.875rem;/);
    expect(globalsCss).toMatch(/--os-article-title-size:\s*1\.125rem;/);
    expect(globalsCss).toMatch(/--os-avatar-feed:\s*2\.5rem;/);
    expect(globalsCss).toMatch(/--os-avatar-nav:\s*2\.25rem;/);
    expect(globalsCss).toMatch(/--os-control-primary:\s*3rem;/);
    expect(globalsCss).toMatch(/--os-nav-band:\s*var\(--os-icon-hit\);/);
    expect(globalsCss).not.toMatch(/font-size:\s*0\.82em;/);
  });

  it('shares the gutter and derives dock clearance from the control box', () => {
    expect(globalsCss).toMatch(/--os-gutter:\s*0\.75rem;/);
    expect(globalsCss).toMatch(
      /\.account-drawer-panel,\s*\.account-storage-panel,[\s\S]*?--os-gutter:\s*1rem;\s*--os-screen-body-pad-x:\s*1rem;\s*--os-sheet-pad-inline:\s*1rem;\s*--os-sheet-footer-pad-inline:\s*1rem;/
    );
    expect(globalsCss).toMatch(/--os-dock-height:\s*2\.75rem;/);
    expect(globalsCss).toMatch(
      /--portfolio-dock-clearance:\s*calc\(\s*var\(--os-dock-height\) \+ var\(--os-dock-bottom-offset\) \+\s*var\(--os-dock-clearance-gap\) \+ env\(safe-area-inset-bottom, 0px\)/
    );
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*1\.1rem;/);
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*1\.6rem;/);
    expect(globalsCss).toMatch(/--os-dock-clearance-gap:\s*0\.85rem;/);
  });

  it('uses the app column token, not a 1.15rem sheet pad', () => {
    expect(globalsCss).toMatch(
      /\.glass-sheet-root \.glass-sheet-panel\.page-drawer-panel \{[\s\S]*?height: 100%;[\s\S]*?max-height: none;[\s\S]*?--os-screen-body-pad-x: var\(--os-gutter\);/
    );
    expect(globalsCss).not.toMatch(
      /\.glass-sheet-root \.glass-sheet-panel\.page-drawer-panel \{[^}]*54rem/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-body \{[\s\S]*?padding: 0\.1rem var\(--os-screen-body-pad-x, 1rem\) 0;/
    );
    expect(globalsCss).toMatch(
      /\.page-drawer-header \{[\s\S]*?padding: 0\.05rem var\(--os-screen-body-pad-x, 1rem\) 0\.4rem;/
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
      /\.page-drawer-scroll-end \{[\s\S]*?height: var\(--portfolio-dock-clearance, 4\.75rem\);/
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
      /\.glass-sheet-root\[data-keep-dock='true'\] \.glass-sheet-body(?=[^{}]*\{[^}]*?padding-bottom: var\(--portfolio-dock-clearance, 4\.75rem\);)/
    );
    expect(globalsCss).toMatch(
      /\.glass-sheet-root\[data-keep-dock='true'\] \.dao-proposals-page \.dao-workspace \{[\s\S]*?padding-bottom: calc\(1\.25rem \+ var\(--portfolio-dock-clearance, 4\.75rem\)\);/
    );
    expect(globalsCss).not.toContain(
      ".glass-sheet-root[data-keep-dock='true'] .dao-org-page .dao-org-page-content"
    );
  });
});
