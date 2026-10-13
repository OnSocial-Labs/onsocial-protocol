'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChoiceDrawerMenu,
  SearchField,
  SheetCloseButton,
  osFloatingPanelCountClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import { MediaFaceStandButton } from '@/components/ui/media-face-stand-button';
import { useOverlayDismiss } from '@/contexts/overlay-dismiss-context';
import { usePageOwnerMood } from '@/hooks/use-page-owner-mood';
import { supportSheetPanelStyle } from '@/lib/moods/resolve';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useNetworkOrbit } from '@/components/panels/network-orbit-context';
import { PROFILE_SEARCH_MAX_QUERY_LENGTH } from '@/lib/profile-account-search';
import { networkAccountIdFromPath, portfolioPath } from '@/lib/overlay-routes';
import {
  armNetworkStandingHandoff,
  holdNetworkStandingFrame,
  rememberStandingOpeningFace,
} from '@/components/panels/network-standing-handoff';
import {
  formatProfileCount,
  standViewLabel,
} from '@/lib/profile-social-standings';
import type { NetworkFilterKind } from '@/lib/profile-network';

function prefetchFull(
  prefetch: (href: string, options?: { kind: 'full' }) => void,
  href: string
) {
  prefetch(href, { kind: 'full' });
}

/**
 * The list is the standing sheet for the person in the center.
 * Face taps rewrite the address only, so Next still owns the first map and
 * a standing push from it keeps that map under the sheet. When the center
 * is someone else, move onto their portfolio first; the handoff host opens
 * the list once that portfolio is the route, and the sheet fades in over
 * the face the same way it does from a profile.
 */
export function useOpenNetworkStandingList() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    accountId: subjectId,
    avatarUrl,
    displayName,
    isSelf,
    listHref,
  } = useNetworkOrbit();

  useEffect(() => {
    if (!subjectId) return;
    const routeAccountId = networkAccountIdFromPath(pathname ?? '');
    const prefetch = router.prefetch as (
      href: string,
      options?: { kind: 'full' }
    ) => void;
    if (routeAccountId === subjectId) {
      prefetchFull(prefetch, listHref);
      return;
    }
    prefetchFull(prefetch, portfolioPath(subjectId));
    prefetchFull(prefetch, listHref);
  }, [listHref, pathname, router, subjectId]);

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      rememberStandingOpeningFace({
        accountId: subjectId,
        displayName,
        avatarUrl,
        subjectIsViewer: isSelf,
      });
      const routeAccountId = networkAccountIdFromPath(pathname ?? '');
      if (routeAccountId === subjectId) {
        router.push(listHref);
        return;
      }
      armNetworkStandingHandoff({
        accountId: subjectId,
        href: listHref,
        displayName,
        avatarUrl,
      });
      document.documentElement.dataset.standingHandoff = 'open';
      holdNetworkStandingFrame();
      const prefetch = router.prefetch as (
        href: string,
        options?: { kind: 'full' }
      ) => void;
      prefetchFull(prefetch, portfolioPath(subjectId));
      prefetchFull(prefetch, listHref);
      router.replace(portfolioPath(subjectId), { scroll: false });
    },
    [avatarUrl, displayName, isSelf, listHref, pathname, router, subjectId]
  );
}

function countAccentClass(kind: NetworkFilterKind): string {
  return kind === 'mutual'
    ? 'os-floating-panel-count--solidarity'
    : 'os-floating-panel-count--standing';
}

function CountBadge({
  kind,
  count,
}: {
  kind: NetworkFilterKind;
  count: number;
}) {
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
  const { accountId, filter, setFilter, counts, isSelf, query, setQuery } =
    useNetworkOrbit();
  const mood = usePageOwnerMood(accountId, Boolean(accountId));
  const signalStyle = useMemo(
    () =>
      mood
        ? (supportSheetPanelStyle(mood.cssVars) as CSSProperties)
        : undefined,
    [mood]
  );

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
      leading: <CountBadge kind={option.value} count={counts[option.value]} />,
    })
  );

  return (
    <div className="standing-list-toolbar network-orbit-toolbar">
      <ChoiceDrawerMenu
        label="Network"
        value={filter}
        options={options}
        onChange={setFilter}
        triggerMeta={<CountBadge kind={filter} count={counts[filter]} />}
        className="standing-view-menu"
        {...(mood?.id ? { moodId: mood.id } : {})}
        {...(signalStyle ? { panelStyle: signalStyle } : {})}
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

/** Stand with the person in the center. Own map has no stand-with-yourself. */
export function NetworkCenterStandAction() {
  const { accountId, avatarUrl, displayName, isSelf } = useNetworkOrbit();
  if (!accountId || isSelf) return null;
  const name = displayName.trim() || accountId;
  return (
    <MediaFaceStandButton
      accountId={accountId}
      name={name}
      avatarUrl={avatarUrl}
    />
  );
}

export function NetworkOrbitSheetHeader() {
  const close = useOverlayDismiss();
  const { accountId, displayName, avatarUrl } = useNetworkOrbit();
  const label = displayName.trim() || accountId;

  return (
    <div className="standing-sheet-header standing-sheet-header--compact">
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
        <div className="standing-sheet-actions network-orbit-header-actions">
          <NetworkCenterStandAction />
          <SheetCloseButton onClick={close} ariaLabel="Close Network" />
        </div>
      </div>
      <div className="os-app-chrome-rail standing-sheet-toolbar-row standing-toolbar-rail">
        <NetworkOrbitToolbar />
      </div>
    </div>
  );
}
