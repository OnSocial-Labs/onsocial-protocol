'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  InformationCircleIcon,
  OsHugSheet,
  PlusIcon,
  ProtocolMotionArrow,
} from '@onsocial/ui';
import {
  GUILD_SPACE_KIND_OPTIONS,
  canPostToGuildSpace,
  postPolicyHint,
  postPolicyLabel,
  type GuildSpace,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import {
  guildSpaceWritersShareDisplay,
  loadGuildSpaceWriterCounts,
  type GuildSpaceWritersShareDisplay,
} from '@/features/guilds/guild-space-write';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

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
  value: ReactNode;
}) {
  return (
    <div className="guild-facts-row">
      <span className="guild-facts-label">{label}</span>
      <span className="guild-facts-value">{value}</span>
    </div>
  );
}

function WritersShareValue({
  display,
}: {
  display: GuildSpaceWritersShareDisplay;
}) {
  if (display.kind === 'loading') {
    return (
      <span className="guild-facts-count-value is-loading" aria-hidden>
        <span className="guild-facts-count">–</span>
        <span className="guild-facts-unit"> can share</span>
      </span>
    );
  }
  if (display.kind === 'leaders-only') {
    return <span className="guild-facts-link-label">Leaders only</span>;
  }
  return (
    <span className="guild-facts-count-value">
      <span className="guild-facts-count">{display.count}</span>
      <span className="guild-facts-unit"> can share</span>
    </span>
  );
}

function writersShareAriaLabel(display: GuildSpaceWritersShareDisplay): string {
  if (display.kind === 'loading') return 'Loading who can share';
  if (display.kind === 'leaders-only')
    return 'Leaders only. View who can share';
  return `${display.count} can share. View who can share`;
}

function GuildRoomFactsSheet({
  groupId,
  space,
  viewer,
  open,
  onClose,
  onOpenWriters,
}: {
  groupId: string;
  space: GuildSpace;
  viewer: GuildViewerAccess;
  open: boolean;
  onClose: () => void;
  onOpenWriters?: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [writersDisplay, setWritersDisplay] =
    useState<GuildSpaceWritersShareDisplay>({ kind: 'loading' });
  const sheetOpen = open && !closing;
  const canShare = canPostToGuildSpace(space, viewer);
  const canViewWriters =
    Boolean(onOpenWriters) && space.postPolicy === 'allowlist';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setWritersDisplay({ kind: 'loading' });
    }
  }

  useEffect(() => {
    if (!open || space.postPolicy !== 'allowlist') return;

    let cancelled = false;
    void (async () => {
      try {
        const counts = await loadGuildSpaceWriterCounts(
          createReadOnlyOnSocialClient(),
          groupId,
          space.id
        );
        if (!cancelled) {
          setWritersDisplay(
            guildSpaceWritersShareDisplay(
              counts.grantedCount,
              counts.leaderCount
            )
          );
        }
      } catch {
        if (!cancelled) setWritersDisplay({ kind: 'leaders-only' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, open, space.id, space.postPolicy]);

  const requestClose = () => {
    setClosing(true);
  };

  const whoCanShareValue =
    space.postPolicy === 'allowlist' ? (
      <WritersShareValue display={writersDisplay} />
    ) : (
      postPolicyLabel(space.postPolicy)
    );

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={() => {
        setClosing(false);
        onClose();
      }}
      label={space.title}
      copy="Room details"
      closeAriaLabel="Close room info"
      backdropLabel="Close room info"
      zIndex={56}
      presentation="swap"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts">
        <section className="guild-facts-section">
          <h3 className="guild-facts-section-title">Sharing</h3>
          <div className="guild-facts-section-rows">
            <GuildRoomFactsRow
              label="Who can share"
              value={
                canViewWriters ? (
                  <button
                    type="button"
                    className="guild-facts-link group"
                    aria-label={writersShareAriaLabel(writersDisplay)}
                    onClick={() => {
                      requestClose();
                      onOpenWriters?.();
                    }}
                  >
                    {whoCanShareValue}
                    <ProtocolMotionArrow className="guild-facts-link-arrow" />
                  </button>
                ) : (
                  whoCanShareValue
                )
              }
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
            <GuildRoomFactsRow
              label="Type"
              value={spaceKindLabel(space.kind)}
            />
            <GuildRoomFactsRow
              label="Who sees this"
              value={audienceLabel(space.audience)}
            />
          </div>
        </section>
      </div>
    </OsHugSheet>
  );
}

export function GuildFeedFilterList({
  groupId,
  selectedFeedFilterId,
  onSelectFeedFilter,
  feedSpaces,
  canAddMember,
  onAddSpace,
  viewer,
  onOpenWriters,
  pinned = false,
  scrollHidden = false,
}: {
  groupId: string;
  selectedFeedFilterId: 'all' | string;
  onSelectFeedFilter: (id: 'all' | string) => void;
  feedSpaces: GuildSpace[];
  canAddMember: boolean;
  onAddSpace: () => void;
  viewer: GuildViewerAccess;
  onOpenWriters?: (space: GuildSpace) => void;
  /** Stick under the elevated immersive header once the hero title hands off. */
  pinned?: boolean;
  /** Tuck away on scroll down while pinned (Market / Home chrome rail). */
  scrollHidden?: boolean;
}) {
  const [factsSpace, setFactsSpace] = useState<GuildSpace | null>(null);

  return (
    <>
      <div className={`guild-feed-filter-pin${pinned ? ' is-pinned' : ''}`}>
        <div
          className={`guild-feed-filter-pin-inner${
            pinned && scrollHidden ? ' is-scroll-hidden' : ''
          }`}
        >
          <div className="guild-feed-filter-list" aria-label="Guild rooms">
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
                    <InformationCircleIcon
                      className="guild-feed-filter-chip-info"
                      aria-hidden
                    />
                  ) : null}
                </button>
              );
            })}
            {canAddMember ? (
              <button
                type="button"
                className="guild-feed-filter-button guild-feed-filter-button--add"
                aria-label="Add room"
                onClick={onAddSpace}
              >
                <PlusIcon aria-hidden className="guild-feed-filter-add-icon" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {factsSpace ? (
        <GuildRoomFactsSheet
          groupId={groupId}
          space={factsSpace}
          viewer={viewer}
          open
          onClose={() => setFactsSpace(null)}
          onOpenWriters={
            onOpenWriters && factsSpace.postPolicy === 'allowlist'
              ? () => {
                  const space = factsSpace;
                  setFactsSpace(null);
                  onOpenWriters(space);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
