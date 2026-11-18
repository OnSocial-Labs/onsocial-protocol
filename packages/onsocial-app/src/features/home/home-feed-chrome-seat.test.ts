import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
  'utf8'
);

function ruleBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) return '';
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(start, close + 1);
}

describe('home rail tuck keeps the body inset', () => {
  it('translates the rail away and does not clear screen-body padding', () => {
    const rail = ruleBlock('.home-feed-compact-chrome.is-scroll-hidden {');
    expect(rail).toContain('translateY(-100%)');
    expect(rail).not.toContain('max-height: 0');

    const bodyClear = css.includes('.home-feed-compact-chrome.is-scroll-hidden')
      ? css
          .split('.home-feed-compact-chrome.is-scroll-hidden')
          .slice(1)
          .join('\n')
      : '';
    expect(bodyClear).not.toMatch(
      /os-app-screen-body\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/
    );
  });
});

describe('load-more footer seat', () => {
  it('reserves the dots row from the sentinel, the pending padding, and the sm dot', () => {
    const footer = ruleBlock('.home-feed-load-more {');
    expect(footer).toContain('min-height');
    expect(footer).toContain('0.75rem');
    expect(footer).toContain('0.25rem');
    expect(footer).not.toContain('29px');
  });
});

describe('feed reveal motion', () => {
  it('fades with --os-motion-appear and stays visible under reduced motion', () => {
    expect(css).toContain(
      '.home-feed-reveal-body {\n      animation: glass-sheet-appear var(--os-motion-appear, 280ms)'
    );
    expect(css).toContain(
      '@media (prefers-reduced-motion: reduce) {\n    .home-feed-reveal-body {\n      animation: none;\n    }\n  }'
    );
    expect(css).not.toMatch(/\.home-feed-reveal-body\s*\{[^}]*opacity:\s*0/);
  });
});
