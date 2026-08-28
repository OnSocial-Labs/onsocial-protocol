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

  it('renders a selected removable chip as a cluster with ×', () => {
    const html = renderToStaticMarkup(
      createElement(OsChipRail, {
        ariaLabel: 'Feed',
        value: 'saved:social',
        onValueChange: () => undefined,
        items: [
          { id: 'pulse', label: 'Pulse' },
          {
            id: 'saved:social',
            label: '$SOCIAL',
            onRemove: () => undefined,
            removeAriaLabel: 'Remove $SOCIAL',
          },
        ],
      })
    );

    expect(html).toContain('discover-tab-bar-chip-cluster is-active');
    expect(html).toContain('discover-tab-bar-chip-remove');
    expect(html).toContain('aria-label="Remove $SOCIAL"');
    expect(html).toContain('>$SOCIAL<');
    expect(html).not.toContain('discover-tab-bar-chip-cluster is-active">Pulse');
  });

  it('renders trailing after chips', () => {
    const html = renderToStaticMarkup(
      createElement(OsChipRail, {
        ariaLabel: 'Feed',
        value: 'pulse',
        onValueChange: () => undefined,
        items: [{ id: 'pulse', label: 'Pulse' }],
        trailing: createElement('button', {
          type: 'button',
          className: 'discover-tab-bar-chip-add',
          'aria-label': 'Add feed',
        }),
      })
    );

    expect(html).toContain('discover-tab-bar-chip-add');
    expect(html).toContain('aria-label="Add feed"');
    expect(html.indexOf('>Pulse<')).toBeLessThan(
      html.indexOf('discover-tab-bar-chip-add')
    );
  });
});
