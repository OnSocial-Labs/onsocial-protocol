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

describe('page drawer feed inset', () => {
  it('uses the app column token, not a 1.15rem sheet pad', () => {
    expect(globalsCss).toMatch(
      /\.glass-sheet-panel\.page-drawer-panel \{[\s\S]*?--os-screen-body-pad-x: 1rem;/
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

  it('uses dock clearance for keep-dock sheet bodies', () => {
    expect(globalsCss).toMatch(
      /\.glass-sheet-root\[data-keep-dock='true'\] \.glass-sheet-body \{[\s\S]*?padding-bottom: var\(--portfolio-dock-clearance, 4\.75rem\);/
    );
    expect(globalsCss).toMatch(
      /\.glass-sheet-root\[data-keep-dock='true'\] \.dao-proposals-page \.dao-workspace \{[\s\S]*?padding-bottom: calc\(1\.25rem \+ var\(--portfolio-dock-clearance, 4\.75rem\)\);/
    );
  });
});
