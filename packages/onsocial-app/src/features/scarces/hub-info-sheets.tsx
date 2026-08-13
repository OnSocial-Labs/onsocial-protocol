'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  ProfileAvatar,
  ProtocolMotionArrow,
} from '@onsocial/ui';
import {
  SheetFactCopy,
  SheetFactCount,
  SheetFactRow,
  SheetFactSection,
} from '@/components/ui/sheet-facts';
import {
  appVolumeNearLabel,
  creatorAccessLabel,
  creatorAccessShort,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatCompactCount,
  formatPageDrawerJoinedFullLabel,
} from '@/lib/page-drawer-meta';
import { displayName, fallbackLabel } from '@/lib/profile-display';

/**
 * Hub twin of the guild facts drawer — access, activity stats, details.
 * Opened from the hero meta info control; stats come from the indexer rollup.
 */
export function HubFactsSheet({
  open,
  onClose,
  app,
  stats,
  onOpenCreators,
}: {
  open: boolean;
  onClose: () => void;
  app: AppView;
  stats: AppStatsView | null;
  onOpenCreators: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const ownerProfiles = usePostAuthorProfiles(open ? [app.ownerId] : []);
  const ownerProfile = ownerProfiles[app.ownerId];
  const ownerLabel = ownerProfile?.displayName ?? displayName(app.ownerId);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const keepPct = ((10000 - app.primarySaleBps) / 100)
    .toFixed(2)
    .replace(/\.?0+$/, '');
  const createdLabel = app.createdAtMs
    ? formatPageDrawerJoinedFullLabel(app.createdAtMs)
    : null;
  const categoryLine =
    app.categories.length > 0
      ? app.categories
          .map((category) => hubCategoryLabel(category) ?? category)
          .join(' · ')
      : null;
  const creatorCount =
    1 +
    app.moderators.length +
    (app.creatorAccess === 'approval' ? app.approvedCreators.length : 0);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Hub"
      copy={app.title}
      closeAriaLabel="Close hub facts"
      backdropLabel="Close hub facts"
      zIndex={57}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts">
        <SheetFactSection title="Creators">
          <SheetFactRow label="Access" value={creatorAccessShort(app.creatorAccess)} />
          <SheetFactCopy>
            {creatorAccessLabel(app.creatorAccess)}.
          </SheetFactCopy>
          <SheetFactRow label="Commission" value={`${app.commissionPct}%`} />
          <SheetFactCopy>
            {app.primarySaleBps === 0
              ? 'The hub takes no cut — creators keep 100% of every primary sale.'
              : `The hub keeps ${app.commissionPct}% of each primary sale — creators keep ${keepPct}%.`}
          </SheetFactCopy>
          <SheetFactRow
            label="Roster"
            value={
              <button
                type="button"
                className="guild-facts-link group"
                onClick={() => {
                  onOpenCreators();
                  requestClose();
                }}
              >
                <SheetFactCount
                  count={formatCompactCount(creatorCount)}
                  unit={creatorCount === 1 ? 'creator' : 'creators'}
                />
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </button>
            }
          />
        </SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="Activity">
          {stats ? (
            <>
              <SheetFactRow
                label="Drops"
                value={<SheetFactCount count={formatCompactCount(stats.dropsTotal)} />}
              />
              <SheetFactRow
                label="Minted"
                value={
                  <SheetFactCount
                    count={formatCompactCount(stats.mintedTotal)}
                    unit={stats.mintedTotal === 1 ? 'item' : 'items'}
                  />
                }
              />
              <SheetFactRow
                label="Holders"
                value={
                  <SheetFactCount
                    count={formatCompactCount(stats.uniqueHolders)}
                    unit={stats.uniqueHolders === 1 ? 'account' : 'accounts'}
                  />
                }
              />
              <SheetFactRow
                label="Sales"
                value={
                  <SheetFactCount
                    count={formatCompactCount(stats.salesCount)}
                    unit={`· ${appVolumeNearLabel(stats.salesVolumeYocto)} NEAR`}
                  />
                }
              />
              <SheetFactRow
                label="On Market"
                value={
                  <SheetFactCount
                    count={formatCompactCount(stats.liveListings)}
                    unit={stats.liveListings === 1 ? 'listing' : 'listings'}
                  />
                }
              />
            </>
          ) : (
            <SheetFactCopy>Activity is still indexing.</SheetFactCopy>
          )}
        </SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="Details">
          <SheetFactRow
            label="Owner"
            value={
              <Link
                href={portfolioPath(app.ownerId)}
                className="guild-facts-link group"
                scroll={false}
                title={fallbackLabel(app.ownerId)}
                onClick={requestClose}
              >
                <span className="guild-facts-link-label">{ownerLabel}</span>
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </Link>
            }
          />
          {createdLabel ? (
            <SheetFactRow label="Created" value={createdLabel} />
          ) : null}
          {categoryLine ? (
            <SheetFactRow label="Category" value={categoryLine} />
          ) : null}
          <SheetFactRow
            label="ID"
            value={<span className="guild-facts-id">{app.appId}</span>}
          />
        </SheetFactSection>
      </div>
    </OsHugSheet>
  );
}

interface HubPerson {
  accountId: string;
  role: string;
}

function buildHubPeople(app: AppView): HubPerson[] {
  const seen = new Set<string>();
  const people: HubPerson[] = [];
  const push = (accountId: string, role: string) => {
    const id = accountId.trim();
    if (!id || seen.has(id.toLowerCase())) return;
    seen.add(id.toLowerCase());
    people.push({ accountId: id, role });
  };
  push(app.ownerId, 'Owner');
  for (const id of app.moderators) push(id, 'Moderator');
  if (app.creatorAccess === 'approval') {
    for (const id of app.approvedCreators) push(id, 'Creator');
  }
  return people;
}

/** Who publishes here — owner, moderators, approved creators. */
export function HubCreatorsSheet({
  open,
  onClose,
  app,
}: {
  open: boolean;
  onClose: () => void;
  app: AppView;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const people = buildHubPeople(app);
  const profiles = usePostAuthorProfiles(
    open ? people.map((person) => person.accountId) : []
  );

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Creators"
      copy={app.title}
      closeAriaLabel="Close creators"
      backdropLabel="Close creators"
      zIndex={57}
      presentation="swap"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <ul className="hub-people-list">
        {people.map((person) => {
          const profile = profiles[person.accountId];
          return (
            <li key={person.accountId}>
              <Link
                href={portfolioPath(person.accountId)}
                scroll={false}
                className="hub-people-row"
                onClick={requestClose}
              >
                <ProfileAvatar
                  src={profile?.avatarUrl ?? null}
                  fallbackInitial={
                    profile?.displayName ?? person.accountId
                  }
                  size="sm"
                  className="hub-people-avatar"
                />
                <span className="hub-people-copy">
                  <span className="hub-people-name">
                    {profile?.displayName?.trim() ||
                      displayName(person.accountId)}
                  </span>
                  <span className="hub-people-handle">
                    @{fallbackLabel(person.accountId)}
                  </span>
                </span>
                <span className="hub-people-role">{person.role}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </OsHugSheet>
  );
}
