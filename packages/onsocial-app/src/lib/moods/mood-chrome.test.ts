import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const surfaceCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-surface-interactive.css'),
  'utf8'
);
const gestureHeaderCss = readFileSync(
  join(here, '../../../../onsocial-ui/os-gesture-sheet-header.css'),
  'utf8'
);
const gestureSheetTs = readFileSync(
  join(here, '../../../../onsocial-ui/src/os-gesture-sheet.tsx'),
  'utf8'
);
const buySheetTs = readFileSync(
  join(here, '../../features/scarces/scarce-buy-sheet.tsx'),
  'utf8'
);
const resolveTs = readFileSync(join(here, 'resolve.ts'), 'utf8');

describe('mood chrome map', () => {
  it('defines --mood-ink for identity chrome, not row hover tint', () => {
    expect(globalsCss).toContain(
      '--mood-ink: var(--mood-accent-chrome, var(--mood-accent));'
    );
    expect(globalsCss).toContain(
      '--os-surface-row-hover: rgb(var(--fg-rgb) / 0.03);'
    );
    expect(globalsCss).toMatch(
      /Mood content lists — neutral hover, no background transition/
    );
    expect(globalsCss).not.toContain('--os-content-frost-hover:');
    expect(globalsCss).not.toContain('--os-mood-hover-fill:');
    expect(globalsCss).not.toContain('--post-frost-a');
    expect(globalsCss).toMatch(
      /\.post-card--openable:hover[\s\S]*?rgb\(var\(--fg-rgb\) \/ 0\.03\)/
    );
    expect(globalsCss).toMatch(
      /Wallet drawer — protocol grey hover on every in-card control/
    );
    expect(globalsCss).toMatch(
      /\.account-drawer-panel \.account-card[\s\S]*?account-shortcut-dock/
    );
    expect(resolveTs).not.toContain("'--mood-ink'");
  });

  it('remaps selected chips to reputation; ready stays protocol green', () => {
    expect(globalsCss).toContain(
      '--os-chip-selected-ink: var(--signal-reputation);'
    );
    expect(surfaceCss).toContain('color: var(--os-chip-selected-ink);');
    expect(surfaceCss).toContain(
      '--os-chip-selected-ink: var(--protocol-green-ink, var(--protocol-green));'
    );
    expect(surfaceCss).toMatch(
      /\.os-surface-chip\.is-ready \{\s*[\s\S]*?color: var\(--protocol-green-ink/
    );
  });

  it('hand-rolled selected pills consume the same remappable tokens', () => {
    expect(globalsCss).toMatch(
      /\.drop-cal-chip\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
    expect(globalsCss).toMatch(
      /\.drop-cal-day\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
    expect(globalsCss).toMatch(
      /\.app-access-option\.is-selected \{\s*background: var\(--os-chip-selected-fill\);\s*color: var\(--os-chip-selected-ink\);/
    );
  });

  it('keeps reply / quote as distinct signals; like and boost stay protocol', () => {
    expect(globalsCss).toContain(
      'color: var(--signal-standing, var(--protocol-blue));'
    );
    expect(globalsCss).toContain(
      'color: var(--signal-reputation, var(--protocol-green));'
    );
    expect(globalsCss).toMatch(
      /\.post-card-react\.is-active \{\s*color: var\(--protocol-red\);/
    );
    expect(globalsCss).toMatch(
      /\.post-card-amplify\.is-active \{\s*color: var\(--protocol-amber\);/
    );
  });

  it('points commerce verbs and discover chips at reputation', () => {
    expect(globalsCss).toContain(
      'color: var(--signal-reputation, var(--protocol-green, #00ec97));'
    );
    expect(globalsCss).toMatch(
      /\.discover-trending-chip \{\s*[\s\S]*?color: var\(\s*--signal-reputation/
    );
    expect(globalsCss).toMatch(
      /\.discover-tab-bar--browse button \{\s*[\s\S]*?color: var\(\s*--signal-reputation/
    );
  });

  it('paints received Support amounts with reputation, not hard green', () => {
    expect(globalsCss).toContain(
      '.portfolio-support-collect-info-amount {'
    );
    expect(globalsCss).toMatch(
      /\.portfolio-support-collect-info-amount \{[\s\S]*?color: var\(--signal-reputation, var\(--protocol-green\)\);/
    );
    expect(globalsCss).toMatch(
      /\.endorsement-supporters-amount \{[\s\S]*?color: var\(--signal-reputation, var\(--protocol-green\)\);/
    );
  });

  it('remaps chips on [data-mood]; commerce sheets pass moodId', () => {
    expect(globalsCss).toMatch(
      /\.glass-sheet-panel\[data-mood\],\s*\n\s*\.os-page-sheet-panel\[data-mood\] \{\s*[\s\S]*?--os-chip-selected-ink: var\(--signal-reputation\);/
    );
    expect(globalsCss).not.toContain('os-gesture-sheet-panel--commerce');
    expect(gestureHeaderCss).not.toContain('os-gesture-sheet-panel--commerce');
    expect(gestureSheetTs).not.toContain(
      'osGestureSheetPanelCommerceClassName'
    );
    expect(buySheetTs).toContain('moodId={moodId}');
    expect(buySheetTs).not.toContain('osGestureSheetPanelCommerceClassName');
  });

  it('keeps love / player on hard protocol green', () => {
    expect(globalsCss).toMatch(
      /\.scarce-clip-track-love\.is-loved \{\s*color: var\(--protocol-green/
    );
    expect(globalsCss).toMatch(
      /\.scarce-clip-progress-fill \{\s*[\s\S]*?background: color-mix\(in srgb, var\(--protocol-green\)/
    );
  });
});
