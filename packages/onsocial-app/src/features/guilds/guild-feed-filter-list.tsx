'use client';

import { useId, useState } from 'react';
import {
  Divider,
  GlassSheet,
  InformationCircleFillIcon,
  PlusIcon,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  GUILD_SPACE_KIND_OPTIONS,
  canPostToGuildSpace,
  postPolicyHint,
  postPolicyLabel,
  type GuildSpace,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { useScrollLock } from '@/hooks/use-scroll-lock';

function spaceKindLabel(kind: GuildSpace['kind']): string {
  return (
    GUILD_SPACE_KIND_OPTIONS.find((option) => option.value === kind)?.label ??
    kind
  );
}

function audienceLabel(audience: GuildSpace['audience']): string {
  return audience === 'public' ? 'Public' : 'Members';
}

function GuildRoomFactsRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

function GuildRoomFactsSheet({
  space,
  viewer,
  open,
  onClose,
  onManageWriters,
}: {
  space: GuildSpace;
  viewer: GuildViewerAccess;
  open: boolean;
  onClose: () => void;
  onManageWriters?: () => void;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const sheetOpen = open && !closing;
  const canShare = canPostToGuildSpace(space, viewer);
  const canManageWriters =
    Boolean(onManageWriters) &&
    space.postPolicy === 'allowlist' &&
    (viewer.isAdmin || viewer.isOwner);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  useScrollLock(open || closing);

  const requestClose = () => {
    setClosing(true);
  };

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={() => {
        setClosing(false);
        onClose();
      }}
      tone="os"
      initialDetent="peek"
      zIndex={56}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close room info"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-facts-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    {space.title}
                  </h2>
                  <p className="discover-sheet-subtitle">Room details</p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts">
        <section className="guild-facts-section">
          <h3 className="guild-facts-section-title">Sharing</h3>
          <div className="guild-facts-section-rows">
            <GuildRoomFactsRow
              label="Who can share"
              value={postPolicyLabel(space.postPolicy)}
            />
            <GuildRoomFactsRow
              label="Rule"
              value={postPolicyHint(space.postPolicy)}
            />
            {viewer.isMember ? (
              <GuildRoomFactsRow
                label="You"
                value={canShare ? 'Can share' : "Can't share yet"}
              />
            ) : null}
          </div>
        </section>

        <section className="guild-facts-section">
          <h3 className="guild-facts-section-title">Details</h3>
          <div className="guild-facts-section-rows">
            <GuildRoomFactsRow label="Type" value={spaceKindLabel(space.kind)} />
            <GuildRoomFactsRow
              label="Who sees this"
              value={audienceLabel(space.audience)}
            />
          </div>
        </section>

        {canManageWriters ? (
          <button
            type="button"
            className="guild-secondary-button guild-room-meta-manage"
            onClick={() => {
              requestClose();
              onManageWriters?.();
            }}
          >
            Choose who can share
          </button>
        ) : null}
      </div>
    </GlassSheet>
  );
}

export function GuildFeedFilterList({
  selectedFeedFilterId,
  onSelectFeedFilter,
  feedSpaces,
  canAddMember,
  onAddSpace,
  viewer,
  onManageWriters,
  receded = false,
}: {
  selectedFeedFilterId: 'all' | string;
  onSelectFeedFilter: (id: 'all' | string) => void;
  feedSpaces: GuildSpace[];
  canAddMember: boolean;
  onAddSpace: () => void;
  viewer: GuildViewerAccess;
  onManageWriters?: (space: GuildSpace) => void;
  /** Hide in-flow row once filters dock into the elevated header. */
  receded?: boolean;
}) {
  const [factsSpace, setFactsSpace] = useState<GuildSpace | null>(null);

  return (
    <>
      <div
        className={`guild-feed-filter-list${receded ? ' is-receded' : ''}`}
        aria-label="Guild rooms"
      >
        <button
          className={`guild-feed-filter-button${selectedFeedFilterId === 'all' ? ' is-active' : ''}`}
          type="button"
          onClick={() => onSelectFeedFilter('all')}
        >
          All
        </button>
        {feedSpaces.map((space) => {
          const isActive = selectedFeedFilterId === space.id;
          return (
            <button
              key={space.id}
              className={`guild-feed-filter-button${isActive ? ' is-active' : ''}${isActive ? ' guild-feed-filter-button--room-active' : ''}`}
              type="button"
              aria-label={
                isActive ? `${space.title}, room details` : space.title
              }
              title={isActive ? 'Room details' : undefined}
              onClick={() => {
                if (isActive) {
                  setFactsSpace(space);
                  return;
                }
                onSelectFeedFilter(space.id);
              }}
            >
              <span className="guild-feed-filter-label">{space.title}</span>
              {isActive ? (
                <InformationCircleFillIcon
                  aria-hidden
                  className="guild-feed-filter-chip-info"
                />
              ) : null}
            </button>
          );
        })}
        {canAddMember ? (
          <button
            className="guild-feed-filter-button guild-feed-filter-button--add"
            type="button"
            onClick={onAddSpace}
            aria-label="Add room"
            title="Add room"
          >
            <PlusIcon aria-hidden className="guild-feed-filter-add-icon" />
          </button>
        ) : null}
      </div>

      {factsSpace ? (
        <GuildRoomFactsSheet
          space={factsSpace}
          viewer={viewer}
          open
          onClose={() => setFactsSpace(null)}
          onManageWriters={
            onManageWriters
              ? () => {
                  const space = factsSpace;
                  setFactsSpace(null);
                  onManageWriters(space);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
