'use client';

import { SearchField, osFloatingPanelCountClassName } from '@onsocial/ui';
import {
  ChoiceDrawerMenu,
  type ChoiceOption,
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
}: {
  kind: StanceDetailKind;
  count: number;
  loading: boolean;
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
      }`}
    >
      {formatProfileCount(count)}
    </span>
  );
}

export function StandingListToolbar({ trailing }: { trailing?: ReactNode }) {
  const { kind, navigateKind, counts, countsLoading, isSelf, query, setQuery } =
    useStandingPanel();

  const kinds: StanceDetailKind[] = ['incoming', 'outgoing', 'mutual'];
  const countFor = (viewKind: StanceDetailKind) => {
    if (viewKind === 'incoming') return counts.incoming;
    if (viewKind === 'outgoing') return counts.outgoing;
    return counts.mutual;
  };

  const options: ChoiceOption<StanceDetailKind>[] = kinds.map((viewKind) => ({
    value: viewKind,
    label: standViewLabel(viewKind, isSelf),
    leading: (
      <CountBadge
        kind={viewKind}
        count={countFor(viewKind)}
        loading={countsLoading}
      />
    ),
  }));

  return (
    <div className="standing-list-toolbar">
      <ChoiceDrawerMenu
        label="Standing"
        value={kind}
        options={options}
        onChange={navigateKind}
        triggerMeta={
          <CountBadge
            kind={kind}
            count={countFor(kind)}
            loading={countsLoading}
          />
        }
        className="standing-view-menu"
      />

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
