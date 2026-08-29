'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from 'react';
import { NoteTextIcon, OsAppChromeToolbarRail } from '@onsocial/ui';
import { OsAppChromeNavSearch } from '@/components/app/os-app-chrome-nav-search';
import { OsChipRail } from '@/components/os/os-chip-rail';
import {
  PROTOCOL_FEED_FAMILY_OPTIONS,
  PROTOCOL_FEED_STATUS_OPTIONS,
  type ProtocolProposalFamily,
} from '@/features/protocol/protocol-feed-filters';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import type { ProtocolFeedStatusFilter } from '@/lib/app-routes';

export type DaoWorkspaceChromeContextValue = {
  scrollRootRef: RefObject<HTMLElement | null>;
  loadState: 'loading' | 'ready' | 'error';
  searchDraft: string;
  setSearchDraft: (value: string) => void;
  searchQuery: string;
  commitSearch: (value: string) => void;
  statusFilter: ProtocolFeedStatusFilter;
  navigateStatus: (status: ProtocolFeedStatusFilter) => void;
  statusCounts: Record<ProtocolFeedStatusFilter, number>;
  familyFilter: ProtocolProposalFamily;
  navigateFamily: (family: ProtocolProposalFamily) => void;
  familyCounts: Record<ProtocolProposalFamily, number>;
  inProposalDetail: boolean;
};

const DaoWorkspaceChromeContext =
  createContext<DaoWorkspaceChromeContextValue | null>(null);

export function DaoWorkspaceChromeProvider({
  value,
  children,
}: {
  value: DaoWorkspaceChromeContextValue;
  children: ReactNode;
}) {
  return (
    <DaoWorkspaceChromeContext.Provider value={value}>
      {children}
    </DaoWorkspaceChromeContext.Provider>
  );
}

function useDaoWorkspaceChrome(): DaoWorkspaceChromeContextValue {
  const value = useContext(DaoWorkspaceChromeContext);
  if (!value) {
    throw new Error(
      'Dao workspace chrome hooks must render inside DaoWorkspaceChromeProvider.'
    );
  }
  return value;
}

/** Compact nav search — same OsAppChromeNavSearch recipe as Market / Messages. */
export function DaoWorkspaceHeaderSearch() {
  const {
    loadState,
    searchDraft,
    setSearchDraft,
    commitSearch,
    inProposalDetail,
  } = useDaoWorkspaceChrome();

  if (inProposalDetail) {
    return null;
  }

  const interactive = loadState === 'ready';

  return (
    <div
      className="dao-proposals-header-search-wrap"
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          commitSearch(searchDraft);
        }
      }}
    >
      <OsAppChromeNavSearch
        value={interactive ? searchDraft : ''}
        onValueChange={interactive ? setSearchDraft : () => undefined}
        placeholder="Search proposals"
        maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
        clearAriaLabel="Clear proposal search"
        ariaLabel="Search proposals"
        idleClassName="discover-nav-search-field dao-proposals-header-search"
        leadingIcon={
          <NoteTextIcon className="search-field-icon" aria-hidden />
        }
      />
    </div>
  );
}

function ProtocolStatusRail() {
  const { statusFilter, navigateStatus, statusCounts } =
    useDaoWorkspaceChrome();

  const items = PROTOCOL_FEED_STATUS_OPTIONS.flatMap((option) => {
    const count = statusCounts[option.id];
    if (option.id !== 'all' && option.id !== 'open' && count === 0) {
      return [];
    }
    return [
      {
        id: option.id,
        label: (
          <>
            {option.label}
            {option.id !== 'all' ? (
              <span className="protocol-status-count">{count}</span>
            ) : null}
          </>
        ),
      },
    ];
  });

  return (
    <OsChipRail
      className="discover-tab-bar--header dao-proposals-status-rail"
      ariaLabel="Proposal status"
      value={statusFilter}
      onValueChange={navigateStatus}
      items={items}
    />
  );
}

function ProtocolFamilyRail() {
  const { familyFilter, navigateFamily, familyCounts } =
    useDaoWorkspaceChrome();

  const items = PROTOCOL_FEED_FAMILY_OPTIONS.flatMap((option) => {
    const count = familyCounts[option.id];
    if (option.id !== 'all' && count === 0) {
      return [];
    }
    return [
      {
        id: option.id,
        label: (
          <>
            {option.label}
            {option.id !== 'all' ? (
              <span className="protocol-status-count">{count}</span>
            ) : null}
          </>
        ),
      },
    ];
  });

  return (
    <OsChipRail
      className="discover-tab-bar--header dao-proposals-family-rail"
      ariaLabel="Proposal kind"
      value={familyFilter}
      onValueChange={navigateFamily}
      items={items}
    />
  );
}

/** Status + family chip rails — scroll tuck hides search above (OsAppScreen scrollTuck="search"). */
export function DaoWorkspaceHeaderToolbar() {
  const { loadState, inProposalDetail } = useDaoWorkspaceChrome();

  if (loadState !== 'ready' || inProposalDetail) {
    return null;
  }

  return (
    <OsAppChromeToolbarRail className="dao-proposals-header-toolbar">
      <div className="dao-proposals-filter-stack">
        <ProtocolStatusRail />
        <ProtocolFamilyRail />
      </div>
    </OsAppChromeToolbarRail>
  );
}
