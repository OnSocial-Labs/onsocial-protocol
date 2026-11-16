'use client';

import {
  CalendarFillIcon,
  ChevronDownIcon,
  OsAppChromeToolbarRail,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { MarketListSkeleton } from '@/features/market/market-list-skeleton';
import { APP_EVENTS_NEW_PATH, APP_HOME_PATH } from '@/lib/app-routes';
import { DROPS_INDEX_PAGE_CLASS } from '@/lib/os-chrome-page';
import { OsRowAction } from '@/lib/os-row-action';

/** Full Events shell for route `loading.tsx` — same chrome geometry as ready. */
export function EventsLoadingScreen() {
  return (
    <OsAppScreen
      title="Events"
      compactChrome
      glassChrome
      scrollTuck="search"
      dockBack
      leading={null}
      backFallbackHref={APP_HOME_PATH}
      heading={
        <OsAppChromeNavSearch
          value=""
          onValueChange={() => undefined}
          placeholder="Search events"
          clearAriaLabel="Clear search"
          ariaLabel="Search events"
          idleClassName="discover-nav-search-field"
          leadingIcon={
            <CalendarFillIcon className="search-field-icon" aria-hidden />
          }
        />
      }
      actions={
        <OsRowAction className="os-header-commit" href={APP_EVENTS_NEW_PATH}>
          New event
        </OsRowAction>
      }
      toolbar={
        <OsAppChromeToolbarRail className="market-listing-toolbar">
          <div className="market-listing-filter-stack os-scrollbar-none">
            <OsChipRail
              className="market-listing-filters"
              ariaLabel="Event list"
              value="all"
              onValueChange={() => undefined}
              items={[
                { id: 'all', label: 'All' },
                { id: 'mine', label: 'My events' },
              ]}
            />
          </div>
          <div className="standing-view-menu market-listing-sort-menu">
            <button
              type="button"
              className={osFloatingPanelTriggerClassName}
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-label="Filter"
              disabled
            >
              <span className={osFloatingPanelTriggerLabelClassName}>
                Filter
              </span>
              <span className={osFloatingPanelTriggerMetaClassName}>
                <ChevronDownIcon
                  className={osFloatingPanelTriggerChevronClassName}
                  aria-hidden
                />
              </span>
            </button>
          </div>
        </OsAppChromeToolbarRail>
      }
    >
      <div className="drops-screen-body">
        <div aria-hidden className="os-chrome-glass" />
        <div
          className={DROPS_INDEX_PAGE_CLASS}
          aria-busy="true"
          aria-live="polite"
        >
          <p className="sr-only">Loading events…</p>
          <MarketListSkeleton rows={6} variant="drops" />
        </div>
      </div>
    </OsAppScreen>
  );
}