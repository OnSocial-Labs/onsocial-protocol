import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const launcherCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-launcher.css'),
  'utf8'
);
const chromeCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-app-chrome.css'),
  'utf8'
);
const sheetCss = readFileSync(
  join(here, '../../../../onsocial-ui/glass-sheet.css'),
  'utf8'
);

describe('12px gutter trial', () => {
  it('keeps the root font and sets the ordinary gutter to 12px', () => {
    expect(globalsCss).toMatch(
      /html \{\s*scrollbar-gutter: stable;\s*font-size: 100%;/
    );
    expect(globalsCss).toMatch(/--os-gutter:\s*0\.75rem;/);
    expect(globalsCss).not.toMatch(/font-size:\s*62\.5%;/);
  });

  it('pins wallet and storage sheets to the previous 16px column', () => {
    expect(globalsCss).toMatch(
      /\.account-drawer-panel,\s*\.account-storage-panel,\s*\.glass-sheet-panel\.os-gesture-sheet-panel,[\s\S]*?--os-gutter:\s*1rem;\s*--os-screen-body-pad-x:\s*1rem;\s*--os-sheet-pad-inline:\s*1rem;\s*--os-sheet-footer-pad-inline:\s*1rem;/
    );
    expect(globalsCss).toMatch(/\.portfolio-support-collect-info-panel,/);
    expect(globalsCss).toMatch(
      /\.glass-sheet-panel:has\(\.protocol-action-sheet-body\),/
    );
    expect(globalsCss).toMatch(/\.hub-manage-slide,/);
    expect(globalsCss).toMatch(/\.dao-org-hug \{/);
  });

  it('keeps safe-area as a minimum on header, dock, and launcher', () => {
    expect(globalsCss).toMatch(
      /\.os-app-screen-header \{[\s\S]*?max\(var\(--os-gutter, 1rem\), env\(safe-area-inset-right, 0px\)\)[\s\S]*?max\(var\(--os-gutter, 1rem\), env\(safe-area-inset-left, 0px\)\)/
    );
    expect(globalsCss).toMatch(
      /\.portfolio-summon-dock \{[\s\S]*?max\(var\(--os-gutter\), env\(safe-area-inset-right, 0px\)\)[\s\S]*?max\(var\(--os-gutter\), env\(safe-area-inset-left, 0px\)\)/
    );
    expect(launcherCss).toMatch(
      /\.os-launcher-grid \{[\s\S]*?max\(var\(--os-gutter, 1rem\), env\(safe-area-inset-right, 0px\)\)[\s\S]*?max\(var\(--os-gutter, 1rem\), env\(safe-area-inset-left, 0px\)\)/
    );
    expect(launcherCss).toMatch(
      /\.os-launcher-header \{[\s\S]*?max\(var\(--os-gutter, 1rem\), env\(safe-area-inset-left, 0px\)\)/
    );
  });

  it('does not move the avatar indent or the desktop column', () => {
    expect(globalsCss).toMatch(
      /\.post-card:not\(\.post-card--skeleton\) > \.post-card-copy \{[\s\S]*?padding-left: calc\(var\(--os-avatar-feed, 2\.25rem\) \+ 0\.75rem\);/
    );
    expect(globalsCss).toMatch(/--os-column-width:\s*min\(100svw, 36rem\);/);
    expect(globalsCss).toMatch(
      /@media \(min-width: 640px\) \{[\s\S]*?\.app-surface \{\s*max-width: 36rem;/
    );
  });

  it('does not move dock geometry or the signed-out gate', () => {
    expect(globalsCss).toMatch(/--os-dock-height:\s*2\.75rem;/);
    expect(globalsCss).toMatch(
      /@media \(max-width: 639px\) \{\s*:root \{\s*--os-dock-height:\s*3rem;/
    );
    expect(globalsCss).toMatch(/--os-control-primary:\s*2\.75rem;/);
    expect(globalsCss).toMatch(/--os-control-primary:\s*3rem;/);
    expect(globalsCss).toMatch(
      /\.os-dock-pill\.gate-connect-button \{[\s\S]*?height: 2\.75rem;[\s\S]*?min-height: 2\.75rem;/
    );
  });

  it('keeps sheet and chrome padding on the gutter token', () => {
    expect(sheetCss).toMatch(
      /--os-sheet-pad-inline:\s*var\(--os-gutter, 1rem\);/
    );
    expect(chromeCss).toMatch(
      /padding-inline:\s*var\(--os-screen-body-pad-x, 1rem\);/
    );
    expect(globalsCss).toMatch(/--os-screen-body-pad-x:\s*var\(--os-gutter\);/);
  });

  it('tracks the desktop caption wash to the gutter without widening under the avatar', () => {
    expect(globalsCss).toMatch(
      /padding: 0 var\(--os-screen-body-pad-x, 0\.75rem\) 0\.55rem;/
    );
    expect(globalsCss).toMatch(
      /--os-media-caption-outset:\s*calc\(2 \* var\(--os-screen-body-pad-x, 0\.75rem\)\);/
    );
    expect(globalsCss).toMatch(
      /\.post-media-strip \{\s*margin-top: 0\.35rem;\s*min-width: 0;/
    );
  });

  it('keeps the feed rail on the avatar centre and the composer rail put', () => {
    expect(globalsCss).toMatch(
      /\.post-thread-item,\s*\.post-thread-more \{[\s\S]*?--thread-rail-x:\s*calc\(var\(--os-avatar-feed, 2\.25rem\) \/ 2\);/
    );
    expect(globalsCss).toMatch(
      /\.guild-composer-thread-item \{[\s\S]*?--thread-rail-x:\s*1\.125rem;/
    );
    expect(globalsCss).toMatch(
      /\.guild-composer-reply-target \{[\s\S]*?--thread-rail-x:\s*1\.125rem;/
    );
  });

  it('lets the post header shrink the name and wrap the action row', () => {
    expect(globalsCss).toMatch(
      /\.post-identity-inline-cluster \.post-identity-handle \{[\s\S]*?min-width:\s*min\(100%, 3\.5ch\);[\s\S]*?white-space:\s*normal;/
    );
    expect(globalsCss).not.toMatch(
      /\.post-identity-inline-cluster \.post-identity-handle \{[^}]*text-overflow:\s*ellipsis;/
    );
    expect(globalsCss).toMatch(
      /@media \(max-width: 639px\) \{\s*\.post-card-menu-trigger \{\s*width:\s*var\(--os-icon-hit\);\s*height:\s*var\(--os-icon-hit\);/
    );
    expect(globalsCss).toMatch(
      /\.post-card-engagement-actions \{[\s\S]*?flex-wrap:\s*wrap;/
    );
  });
});
