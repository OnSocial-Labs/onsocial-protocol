'use client';

import Link from 'next/link';
import {
  AlignJustifyIcon,
  ChoiceDrawerMenu,
  OsIconAction,
  SearchField,
  SheetCloseButton,
  osFloatingPanelCountClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useNetworkOrbit } from '@/components/panels/network-orbit-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatProfileCount,
  standViewLabel,
} from '@/lib/profile-social-standings';
import type { NetworkFilterKind } from '@/lib/profile-network';

function countAccentClass(kind: NetworkFilterKind): string {
  return kind === 'mutual'
    ? 'os-floating-panel-count--solidarity'
    : 'os-floating-panel-count--standing';
}

function CountBadge({ kind, count }: { kind: NetworkFilterKind; count: number }) {
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

export function NetworkOrbitToolbar() {
  const { filter, setFilter, counts, isSelf, query, setQuery } =
    useNetworkOrbit();

  const kindOptions: Array<{ value: NetworkFilterKind; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'mutual', label: standViewLabel('mutual', isSelf) },
    { value: 'incoming', label: standViewLabel('incoming', isSelf) },
    { value: 'outgoing', label: standViewLabel('outgoing', isSelf) },
  ];

  const options: ChoiceOption<NetworkFilterKind>[] = kindOptions.map(
    (option) => ({
      value: option.value,
      label: option.label,
      leading: (
        <CountBadge kind={option.value} count={counts[option.value]} />
      ),
    })
  );

  return (
    <div className="standing-list-toolbar">
      <ChoiceDrawerMenu
        label="Network"
        value={filter}
        options={options}
        onChange={setFilter}
        triggerMeta={<CountBadge kind={filter} count={counts[filter]} />}
        className="standing-view-menu"
      />
      <SearchField
        value={query}
        onValueChange={setQuery}
        placeholder="Search network"
        maxLength={PROFILE_SEARCH_MAX_QUERY_LENGTH}
        clearAriaLabel="Clear network search"
        ariaLabel="Search network"
        chrome="floating-panel"
        className="standing-list-toolbar-search"
      />
    </div>
  );
}

export function NetworkOrbitSheetHeader() {
  const close = useOverlayDismiss();
  const { accountId, displayName, avatarUrl, isSelf, listHref } =
    useNetworkOrbit();
  const label = isSelf ? 'You' : displayName;

  return (
    <div className="standing-sheet-header">
      <div className="standing-sheet-subject-row">
        <Link
          href={portfolioPath(accountId)}
          className="standing-sheet-subject"
          aria-label={`${label} portfolio`}
        >
          <AccountAvatar
            accountId={accountId}
            src={avatarUrl}
            fallbackInitial={displayName}
            size="md"
          />
          <span className="standing-sheet-subject-copy">
            <span className="standing-sheet-subject-name">{label}</span>
          </span>
        </Link>
        <div className="standing-sheet-actions">
          <OsIconAction asChild ariaLabel="Open standing list">
            <Link href={listHref} scroll={false} aria-label="Open standing list">
              <AlignJustifyIcon
                className="glass-sheet-icon-action-glyph"
                aria-hidden
              />
            </Link>
          </OsIconAction>
          <SheetCloseButton onClick={close} ariaLabel="Close Network" />
        </div>
      </div>
      <div className="os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail">
        <NetworkOrbitToolbar />
      </div>
    </div>
  );
}
