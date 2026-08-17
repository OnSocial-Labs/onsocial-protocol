import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OsChipRail } from '@/components/os/os-chip-rail';

describe('OsChipRail', () => {
  it('renders a single-select tablist with aria-selected', () => {
    const html = renderToStaticMarkup(
      createElement(OsChipRail, {
        ariaLabel: 'Drop sort',
        className: 'market-listing-filters',
        value: 'live',
        onValueChange: () => undefined,
        items: [
          { id: 'live', label: 'Live' },
          { id: 'new', label: 'New' },
        ],
      })
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Drop sort"');
    expect(html).toContain('discover-tab-bar market-listing-filters');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('>Live<');
    expect(html).toContain('>New<');
  });

  it('renders multi-select chips with aria-pressed', () => {
    const html = renderToStaticMarkup(
      createElement(OsChipRail, {
        selection: 'multi',
        ariaLabel: 'Genre',
        values: ['ambient'],
        onToggle: () => undefined,
        items: [
          { id: 'ambient', label: 'Ambient' },
          { id: 'techno', label: 'Techno' },
        ],
      })
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('renders listbox options for sheet pickers', () => {
    const html = renderToStaticMarkup(
      createElement(OsChipRail, {
        selection: 'option',
        ariaLabel: 'Medium',
        value: 'audio',
        onValueChange: () => undefined,
        items: [
          { id: 'audio', label: 'Audio' },
          { id: 'ticket', label: 'Tickets' },
        ],
      })
    );

    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
  });
});
