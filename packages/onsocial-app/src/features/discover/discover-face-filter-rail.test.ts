// @vitest-environment jsdom
import { createElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/discover/discover-panel-context', () => ({
  useDiscoverPanel: () => ({
    face: 'all',
    setFace: () => undefined,
    industry: '',
    setIndustry: () => undefined,
    craft: '',
    setCraft: () => undefined,
  }),
}));

import { DiscoverFaceFilterRail } from '@/features/discover/discover-face-filter-rail';
import { DiscoverTabBar } from '@/features/discover/discover-tab-bar';

describe('discover face filter tabs', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  it('gives filter tabs their own ids and aria-controls beside Discover DAOs', () => {
    render(
      createElement(
        'div',
        null,
        createElement(DiscoverTabBar, {
          tab: 'profiles',
          onTabChange: () => undefined,
        }),
        createElement(DiscoverFaceFilterRail)
      )
    );

    const discover = screen.getByRole('tablist', { name: 'Discover' });
    const filters = screen.getByRole('tablist', { name: 'Filter profiles' });
    const discoverIds = new Set(
      within(discover)
        .getAllByRole('tab')
        .map((tab) => tab.id)
    );
    const faceTabs = within(filters).getAllByRole('tab');

    expect(faceTabs.map((tab) => tab.textContent)).toEqual([
      'All',
      'People',
      'Orgs',
      'DAOs',
      'Offers',
      'Hiring',
    ]);
    for (const tab of faceTabs) {
      expect(tab.id).not.toBe('');
      expect(discoverIds.has(tab.id)).toBe(false);
      expect(tab.getAttribute('aria-controls')).toBe('discover-panel-profiles');
    }
    expect(within(discover).getByRole('tab', { name: 'DAOs' }).id).toBe(
      'discover-tab-daos'
    );
    expect(within(filters).getByRole('tab', { name: 'DAOs' }).textContent).toBe(
      'DAOs'
    );
  });
});
