import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PortfolioPageContentEntry } from './portfolio-page-entry';

const iconActionCss = readFileSync(
  new URL('../../../../onsocial-ui/glass-sheet.css', import.meta.url),
  'utf8'
);

describe('portfolio page entry', () => {
  it('is a visible labelled button that opens the page', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioPageContentEntry, { onOpen: () => {} })
    );
    expect(html).toContain('>Open page<');
    expect(html).toContain('aria-label="Open page"');
    expect(html).toContain('type="button"');
    expect(html).toContain('glass-sheet-icon-action');

    const opened: string[] = [];
    const element = PortfolioPageContentEntry({
      onOpen: () => opened.push('open'),
    });
    element.props.onClick();
    expect(opened).toEqual(['open']);
    expect(element.props.ariaLabel).toBe('Open page');
    expect(element.props.children).toBe('Open page');
  });

  it('uses the shared hit target and focus ring', () => {
    expect(iconActionCss).toContain('min-height: var(--os-icon-hit, 3.25rem)');
    expect(iconActionCss).toContain('.glass-sheet-icon-action:focus-visible');
    expect(iconActionCss).toContain('--os-focus-ring');
  });
});
