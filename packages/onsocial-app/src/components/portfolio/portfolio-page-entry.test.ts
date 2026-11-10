import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PortfolioPageContentEntry } from './portfolio-page-entry';

describe('portfolio page entry', () => {
  it('is a button named Open page with a hidden chevron', () => {
    const closed = renderToStaticMarkup(
      createElement(PortfolioPageContentEntry, {
        open: false,
        onOpen: () => {},
      })
    );
    expect(closed).toContain('aria-label="Open page"');
    expect(closed).toContain('type="button"');
    expect(closed).toContain('aria-haspopup="dialog"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain('<svg');
    expect(closed).not.toContain('inert');

    const opened = renderToStaticMarkup(
      createElement(PortfolioPageContentEntry, { open: true, onOpen: () => {} })
    );
    expect(opened).toContain('aria-expanded="true"');

    const calls: string[] = [];
    const element = PortfolioPageContentEntry({
      open: false,
      onOpen: () => calls.push('open'),
    });
    element.props.onClick();
    expect(calls).toEqual(['open']);
    expect(element.props.ariaLabel).toBe('Open page');
    expect(element.props['aria-haspopup']).toBe('dialog');
    expect(element.props['aria-expanded']).toBe(false);
  });
});
