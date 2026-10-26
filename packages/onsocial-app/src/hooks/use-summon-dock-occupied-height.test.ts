import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const hook = readFileSync(
  join(here, 'use-summon-dock-occupied-height.ts'),
  'utf8'
);
const globalsCss = readFileSync(join(here, '../app/globals.css'), 'utf8');

describe('feed scroll clearance', () => {
  it('writes the dock height variable only when the measured value changes', () => {
    expect(hook).toContain('if (value === published) return');
    expect(hook).toContain('published = value');
  });

  it('keeps main scroller padding steady while the dock tucks', () => {
    const clearance = globalsCss.match(
      /\/\* Short clearance only[\s\S]*?\.os-app-screen:has\(> \.portfolio-summon-dock\) \.os-app-screen-body \{[\s\S]*?\}/
    )?.[0];
    expect(clearance).toBeTruthy();
    expect(clearance).not.toContain('transition:');
    expect(clearance).not.toContain(':not(.is-scroll-hidden)');
    expect(globalsCss).toContain(
      '.portfolio-summon-dock.is-scroll-hidden {\n    transform: translateX(-50%)'
    );
  });

  it('reserves collage and quote frames before the file arrives', () => {
    expect(globalsCss).toMatch(
      /\.post-media-strip\.is-collage \.post-media-element \{[^}]*position:\s*absolute;/
    );
    expect(globalsCss).toMatch(
      /\.post-media-strip\.is-collage\.post-media-strip--2 \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/
    );
    expect(globalsCss).toMatch(
      /\.post-card-quote-thumb \{[^}]*max-width:\s*3\.6rem;/
    );
    expect(globalsCss).toMatch(
      /\.post-card-quote-thumb:not\(\.is-collage\) \.post-card-quote-thumb-media \{[^}]*position:\s*absolute;/
    );
  });

  it('sizes home skeletons to the live media and quote frames', () => {
    expect(globalsCss).toMatch(
      /\.post-row-skeleton-media--single \{[^}]*aspect-ratio:\s*4 \/ 3;[^}]*max-height:\s*14rem;/
    );
    expect(globalsCss).toMatch(
      /\.post-row-skeleton-media--collage-2,[\s\S]*?\.post-row-skeleton-media--collage-3 \{[^}]*height:\s*12\.5rem;/
    );
    expect(globalsCss).toMatch(
      /\.post-row-skeleton-media--collage-4 \{[^}]*height:\s*14rem;/
    );
    expect(globalsCss).toMatch(
      /\.post-row-skeleton-quote-thumb \{[^}]*width:\s*3\.6rem;[^}]*height:\s*3\.6rem;/
    );
  });

  it('fades feed images in once they can paint', () => {
    expect(globalsCss).toMatch(
      /\.post-media-element \{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 160ms ease;/
    );
    expect(globalsCss).toContain('.post-media-element.is-resolved');
    expect(globalsCss).toContain('.post-card-quote-thumb-media.is-resolved');
  });
});
