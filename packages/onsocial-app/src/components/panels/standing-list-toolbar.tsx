'use client';

import {
  ChevronDownIcon,
  FloatingPanelMenu,
  osFloatingPanelBodyClassName,
  osFloatingPanelCountClassName,
  osFloatingPanelHeaderActiveClassName,
  osFloatingPanelHeaderClassName,
  osFloatingPanelHeaderLabelClassName,
  osFloatingPanelItemClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
  SearchField,
  useDropdown,
} from '@onsocial/ui';
import { useStandingPanel } from '@/components/panels/standing-panel-context';
import {
  formatProfileCount,
  standViewLabel,
  type StanceDetailKind,
} from '@/lib/profile-social-standings';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import type { ReactNode } from 'react';

function countAccentClass(kind: StanceDetailKind): string {
  return kind === 'mutual'
    ? 'os-floating-panel-count--solidarity'
    : 'os-floating-panel-count--standing';
}

function CountBadge({
  kind,
  count,
  loading,
  inTrigger = false,
}: {
  kind: StanceDetailKind;
  count: number;
  loading: boolean;
  inTrigger?: boolean;
}) {
  if (loading) {
    return (
      <span
        className={`${osFloatingPanelCountClassName} os-floating-panel-count--loading standing-row-shimmer ${countAccentClass(kind)}`}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`${osFloatingPanelCountClassName} ${countAccentClass(kind)}${
        count === 0 ? ' is-zero' : ''
      }${inTrigger ? '' : ''}`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

export function StandingListToolbar({ trailing }: { trailing?: ReactNode }) {
  const {
    kind,
    navigateKind,
    counts,
    countsLoading,
    isSelf,
    query,
    setQuery,
  } = useStandingPanel();
  const { isOpen, close, toggle, containerRef, panelRef } = useDropdown();

  const kinds: StanceDetailKind[] = ['incoming', 'outgoing', 'mutual'];
  const countFor = (viewKind: StanceDetailKind) => {
    if (viewKind === 'incoming') return counts.incoming;
    if (viewKind === 'outgoing') return counts.outgoing;
    return counts.mutual;
  };

  const activeLabel = standViewLabel(kind, isSelf);
  const activeCount = countFor(kind);
  const menuLabel = 'Standing';

  return (
    <div className="standing-list-toolbar">
      <div className="standing-view-menu" ref={containerRef}>
        <button
          type="button"
          className={`${osFloatingPanelTriggerClassName}${isOpen ? ' is-open' : ''}`}
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={
            isOpen
              ? `Close ${menuLabel.toLowerCase()} menu`
              : `Open ${menuLabel.toLowerCase()} menu`
          }
        >
          <span className={osFloatingPanelTriggerLabelClassName}>
            {activeLabel}
          </span>
          <span className={osFloatingPanelTriggerMetaClassName}>
            <CountBadge
              kind={kind}
              count={activeCount}
              loading={countsLoading}
              inTrigger
            />
            <ChevronDownIcon
              className={`${osFloatingPanelTriggerChevronClassName}${
                isOpen ? ' is-open' : ''
              }`}
              aria-hidden
            />
          </span>
        </button>

        <FloatingPanelMenu
          ref={panelRef}
          open={isOpen}
          align="left"
          offset="sm"
          className="standing-view-menu-panel"
          role="listbox"
          aria-label={menuLabel}
        >
          <div className={osFloatingPanelHeaderClassName}>
            <p className={osFloatingPanelHeaderLabelClassName}>{menuLabel}</p>
            <p className={osFloatingPanelHeaderActiveClassName}>
              {activeLabel}
            </p>
          </div>

          <div className={osFloatingPanelBodyClassName}>
            {kinds.map((viewKind) => {
              const selected = viewKind === kind;
              const count = countFor(viewKind);
              const optionLabel = standViewLabel(viewKind, isSelf);

              return (
                <button
                  key={viewKind}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${osFloatingPanelItemClassName}${
                    selected ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    navigateKind(viewKind);
                    close();
                  }}
                >
                  <span>{optionLabel}</span>
                  <CountBadge
                    kind={viewKind}
                    count={count}
                    loading={countsLoading}
                  />
                </button>
              );
            })}
          </div>
        </FloatingPanelMenu>
      </div>

      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Search profiles"
        maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
        clearAriaLabel="Clear profile search"
        ariaLabel="Search standing profiles"
        chrome="floating-panel"
        className="standing-list-toolbar-search"
      />
      {trailing}
    </div>
  );
}
