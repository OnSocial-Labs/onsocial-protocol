'use client';

import { ChevronDownIcon, Divider, useDropdown } from '@onsocial/ui';
import { SearchField } from '@/components/ui/search-field';
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
    ? 'standing-view-count--solidarity'
    : 'standing-view-count--standing';
}

function CountBadge({
  kind,
  count,
  loading,
}: {
  kind: StanceDetailKind;
  count: number;
  loading: boolean;
}) {
  if (loading) {
    return (
      <span
        className={`standing-view-count standing-view-count--loading ${countAccentClass(kind)}`}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`standing-view-count ${countAccentClass(kind)}${
        count === 0 ? ' is-zero' : ''
      }`}
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

  return (
    <div className="standing-list-toolbar">
      <div className="standing-view-menu" ref={containerRef}>
        <button
          type="button"
          className={`standing-view-trigger sheet-control${isOpen ? ' is-open' : ''}${
            kind === 'mutual' ? ' is-solidarity' : ''
          }`}
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={
            isOpen ? 'Close standing view menu' : 'Open standing view menu'
          }
        >
          <span className="standing-view-trigger-label">{activeLabel}</span>
          <span className="standing-view-trigger-meta">
            <CountBadge
              kind={kind}
              count={activeCount}
              loading={countsLoading}
            />
            <ChevronDownIcon
              className={`standing-view-trigger-chevron${
                isOpen ? ' is-open' : ''
              }`}
              aria-hidden
            />
          </span>
        </button>

        {isOpen ? (
          <div
            ref={panelRef}
            className="standing-view-menu-panel"
            role="listbox"
            aria-label="Standing views"
          >
            <div className="standing-view-menu-header">
              <p className="standing-view-menu-eyebrow">Standing</p>
              <p className="standing-view-menu-active">{activeLabel}</p>
            </div>

            <Divider variant="section" className="standing-view-menu-divider" />

            <div className="standing-view-menu-options">
              {kinds.map((viewKind) => {
                const selected = viewKind === kind;
                const count = countFor(viewKind);
                const optionClassName = `standing-view-menu-option${
                  selected ? ' is-selected' : ''
                }${viewKind === 'mutual' ? ' is-solidarity' : ''}`;
                const optionLabel = standViewLabel(viewKind, isSelf);

                return (
                  <button
                    key={viewKind}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={optionClassName}
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
          </div>
        ) : null}
      </div>

      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Search profiles"
        maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
        clearAriaLabel="Clear profile search"
        ariaLabel="Search standing profiles"
        className="standing-list-toolbar-search"
      />
      {trailing}
    </div>
  );
}
