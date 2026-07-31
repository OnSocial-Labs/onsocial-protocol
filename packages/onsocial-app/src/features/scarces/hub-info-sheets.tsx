'use client';

import Link from 'next/link';
import { useCallback, useId, useState, type ReactNode } from 'react';
import {
  Divider,
  GlassSheet,
  ProfileAvatar,
  ProtocolMotionArrow,
  SheetHeader,
} from '@onsocial/ui';
import {
  appVolumeNearLabel,
  creatorAccessLabel,
  creatorAccessShort,
  type AppStatsView,
  type AppView,
} from '@/features/scarces/apps-data';
import { hubCategoryLabel } from '@/features/scarces/hub-categories';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatCompactCount,
  formatPageDrawerJoinedFullLabel,
} from '@/lib/page-drawer-meta';
import { displayName, fallbackLabel } from '@/lib/profile-display';

function FactRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

function FactSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guild-facts-section">
      <h3 className="guild-facts-section-title">{title}</h3>
      <div className="guild-facts-section-rows">{children}</div>
    </section>
  );
}

function CountValue({ count, unit }: { count: number; unit?: string }) {
  return (
    <span className="guild-facts-count-value">
      <span className="guild-facts-count">{formatCompactCount(count)}</span>
      {unit ? <span className="guild-facts-unit"> {unit}</span> : null}
    </span>
  );
}

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
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const ownerProfiles = usePostAuthorProfiles(open ? [app.ownerId] : []);
  const ownerProfile = ownerProfiles[app.ownerId];
  const ownerLabel = ownerProfile?.displayName ?? displayName(app.ownerId);

  useScrollLock(open || closing);

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
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={57}
      ariaLabelledBy={titleId}
      backdropLabel="Close hub facts"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Hub"
            subtitle={app.title}
            onClose={requestClose}
            closeAriaLabel="Close hub facts"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts">
        <FactSection title="Creators">
          <FactRow label="Access" value={creatorAccessShort(app.creatorAccess)} />
          <p className="guild-facts-copy">
            {creatorAccessLabel(app.creatorAccess)}.
          </p>
          <FactRow label="Commission" value={`${app.commissionPct}%`} />
          <p className="guild-facts-copy">
            {app.primarySaleBps === 0
              ? 'The hub takes no cut — creators keep 100% of every primary sale.'
              : `The hub keeps ${app.commissionPct}% of each primary sale — creators keep ${keepPct}%.`}
          </p>
          <FactRow
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
                <CountValue
                  count={creatorCount}
                  unit={creatorCount === 1 ? 'creator' : 'creators'}
                />
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </button>
            }
          />
        </FactSection>

        <Divider variant="detail" />

        <FactSection title="Activity">
          {stats ? (
            <>
              <FactRow
                label="Drops"
                value={<CountValue count={stats.dropsTotal} />}
              />
              <FactRow
                label="Minted"
                value={
                  <CountValue
                    count={stats.mintedTotal}
                    unit={stats.mintedTotal === 1 ? 'item' : 'items'}
                  />
                }
              />
              <FactRow
                label="Holders"
                value={
                  <CountValue
                    count={stats.uniqueHolders}
                    unit={stats.uniqueHolders === 1 ? 'account' : 'accounts'}
                  />
                }
              />
              <FactRow
                label="Sales"
                value={
                  <CountValue
                    count={stats.salesCount}
                    unit={`· ${appVolumeNearLabel(stats.salesVolumeYocto)} NEAR`}
                  />
                }
              />
              <FactRow
                label="On Market"
                value={
                  <CountValue
                    count={stats.liveListings}
                    unit={stats.liveListings === 1 ? 'listing' : 'listings'}
                  />
                }
              />
            </>
          ) : (
            <p className="guild-facts-copy">Activity is still indexing.</p>
          )}
        </FactSection>

        <Divider variant="detail" />

        <FactSection title="Details">
          <FactRow
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
            <FactRow label="Created" value={createdLabel} />
          ) : null}
          {categoryLine ? (
            <FactRow label="Category" value={categoryLine} />
          ) : null}
          <FactRow
            label="ID"
            value={<span className="guild-facts-id">{app.appId}</span>}
          />
        </FactSection>
      </div>
    </GlassSheet>
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
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const people = buildHubPeople(app);
  const profiles = usePostAuthorProfiles(
    open ? people.map((person) => person.accountId) : []
  );

  useScrollLock(open || closing);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      peekRatio={1}
      zIndex={57}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close creators"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <SheetHeader
            titleId={titleId}
            title="Creators"
            subtitle={app.title}
            onClose={requestClose}
            closeAriaLabel="Close creators"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
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
    </GlassSheet>
  );
}
