import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PortfolioPageContentEntry } from './portfolio-page-entry';

const appSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('portfolio page entry', () => {
  it('is a button named Open page with a hidden chevron', () => {
    const closed = renderToStaticMarkup(
      createElement(PortfolioPageContentEntry, {
        open: false,
        concealed: false,
        onOpen: () => {},
      })
    );
    expect(closed).toContain('aria-label="Open page"');
    expect(closed).toContain('type="button"');
    expect(closed).toContain('aria-haspopup="dialog"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('<svg');
    expect(closed).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(closed).not.toMatch(/<button[^>]*aria-hidden="true"/);
    expect(closed).not.toContain('tabindex="-1"');
    expect(closed).not.toContain('inert');

    const opened = renderToStaticMarkup(
      createElement(PortfolioPageContentEntry, {
        open: true,
        concealed: true,
        onOpen: () => {},
      })
    );
    expect(opened).toContain('aria-expanded="true"');
    expect(opened).toMatch(/<button[^>]*aria-hidden="true"/);
    expect(opened).toContain('tabindex="-1"');

    const calls: string[] = [];
    const element = PortfolioPageContentEntry({
      open: false,
      concealed: false,
      onOpen: () => calls.push('open'),
    });
    element.props.onClick();
    expect(calls).toEqual(['open']);
    expect(element.props.ariaLabel).toBe('Open page');
    expect(element.props['aria-haspopup']).toBe('dialog');
    expect(element.props['aria-expanded']).toBe(false);
    expect(element.props['aria-hidden']).toBeUndefined();
    expect(element.props.tabIndex).toBeUndefined();
    expect(element.props.hidden).toBeUndefined();
    expect(closed).not.toContain('is-content-covered');
  });

  it('reserves the pill slot in CSS and does not measure it after paint', () => {
    const css = readFileSync(join(appSrc, 'app/globals.css'), 'utf8');
    expect(css).toContain('--portfolio-chevron-w: 1.5rem;');
    expect(css).toContain('--portfolio-chevron-h: 0.875rem;');
    expect(css).toContain('--portfolio-chevron-gap: 0.25rem;');
    expect(css).toContain('--portfolio-chevron-ring: 4px;');
    expect(css).toContain('--portfolio-chevron-hit: 2.75rem;');
    expect(css).toContain('--portfolio-chevron-slot:');
    expect(css).toContain('--portfolio-face-clearance:');
    const heroStart = css.indexOf('.portfolio-hero {');
    const heroEnd = css.indexOf('.page-drawer-rail-tabs', heroStart);
    const hero = css.slice(heroStart, heroEnd);
    expect(hero).toContain('.portfolio-face-slot');
    expect(hero).toContain('var(--portfolio-face-slot-size)');
    expect(hero).toContain('.portfolio-frame:not(.is-portfolio-swipe)');
    expect(hero).toContain('--portfolio-face-clearance: 0px');
    expect(hero).not.toContain('--os-avatar-nav');
    const frameStart = css.indexOf('--portfolio-pill-footprint:');
    const frame = css.slice(frameStart, frameStart + 700);
    expect(frameStart).toBeGreaterThan(0);
    expect(frame).toContain('var(--portfolio-face-clearance)');
    expect(frame).toContain('var(--portfolio-shelf-pull)');
    expect(frame).toContain('var(--portfolio-shelf-meta-gap)');
    expect(frame).toContain('--portfolio-face-slot-size:');
    expect(frame).toContain('var(--os-dock-height)');
    expect(frame).toContain('var(--os-dock-bottom-offset)');
    expect(frame).toContain('env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('var(--portfolio-viewport-height, 100dvh)');
    expect(css).toContain('bottom: var(--portfolio-dock-bottom, 0px)');
    const pillStart = css.indexOf(
      'button.portfolio-page-chevron.glass-sheet-icon-action {'
    );
    const pillEnd = css.indexOf(
      '@media (prefers-reduced-transparency: reduce)',
      pillStart
    );
    const pill = css.slice(pillStart, pillEnd);
    expect(pill).toContain('var(--portfolio-chevron-w, 1.5rem)');
    expect(pill).toContain('var(--portfolio-chevron-h, 0.875rem)');
    expect(pill).toContain('padding: 0;');
    expect(pill).toContain('border-radius: 9999px;');
    expect(pill).toContain('overflow: visible;');
    expect(pill).toContain('var(--portfolio-chevron-hit, 2.75rem)');
    expect(pill).toContain('opacity: 0.78;');
    expect(pill).toContain('stroke-width: 2px;');
    expect(pill).toContain('pointer-events: none;');
    expect(pill).toContain('prefers-reduced-motion');
    expect(
      existsSync(join(appSrc, 'hooks/use-chevron-face-clearance.ts'))
    ).toBe(false);
    const dock = readFileSync(
      join(appSrc, 'components/portfolio/portfolio-summon-dock.tsx'),
      'utf8'
    );
    expect(dock).not.toContain('useChevronFaceClearance');
    expect(dock).not.toContain('useSwipeUpOpen');
    expect(dock).toContain('portfolioSwipeOpensPage');
    const trigger = readFileSync(
      join(appSrc, 'components/portfolio/portfolio-drawer-scroll-trigger.tsx'),
      'utf8'
    );
    expect(trigger).toContain('portfolioSwipeOpensPage');
    const shell = readFileSync(
      join(appSrc, 'components/portfolio/portfolio-shell.tsx'),
      'utf8'
    );
    expect(shell).toContain('is-portfolio-swipe');
    expect(shell).toContain('portfolioSwipeOpensPage');
    const toast = readFileSync(
      join(appSrc, 'app/transaction-feedback-toast.css'),
      'utf8'
    );
    expect(toast).toContain(
      'background: var(--glass-surface-solid, var(--surface-solid));'
    );
    expect(toast).toContain('box-shadow: var(--os-chrome-elev-shadow);');
    expect(toast).not.toContain('--os-dock-fill');
    expect(toast).not.toContain('#3b82f6');
    expect(toast).not.toContain('rgb(var(--bg-rgb) / 0.92)');
    expect(toast).toContain('color: rgb(var(--fg-rgb));');
  });
});
