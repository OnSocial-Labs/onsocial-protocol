'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  ProtocolMotionArrow,
  normalizeSocialTimestamp,
} from '@onsocial/ui';
import {
  SheetFactCopy,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import {
  guildModeDescription,
  guildModeLabel,
} from '@/features/guilds/guild-card-display';
import { guildMemberTimeMeta } from '@/features/guilds/guild-member-time-meta';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatCompactCount,
  formatPageDrawerJoinedFullLabel,
} from '@/lib/page-drawer-meta';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { topicLabel } from '@/lib/topic-slug';

interface GuildFactsSheetProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  guildName: string;
  accessGated: boolean;
  memberDriven: boolean;
  memberCount: number;
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  joinPending: boolean;
  ownerId?: string | null;
  memberJoinedAt?: number | null;
  createdAt?: number | null;
  postCount?: number | null;
  roomCount?: number | null;
  topics?: string[];
  onOpenMembers: () => void;
}

function viewerStatusLabel(input: {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  canModerate: boolean;
  joinPending: boolean;
}): string {
  if (input.joinPending) return 'Request pending';
  if (!input.isMember) return 'Not a member';
  if (input.isOwner) return 'Owner';
  if (input.isAdmin) return 'Admin';
  if (input.canModerate) return 'Moderator';
  return 'Member';
}

function sameCalendarDay(
  left: number | null | undefined,
  right: number | null | undefined
): boolean {
  const a = normalizeSocialTimestamp(left);
  const b = normalizeSocialTimestamp(right);
  if (a == null || b == null) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Guild twin of account Joined facts — mode, membership, roster entry.
 * Opened from the hero meta info control (not the Joined action).
 */
export function GuildFactsSheet({
  open,
  onClose,
  groupId,
  guildName,
  accessGated,
  memberDriven,
  memberCount,
  isMember,
  isOwner,
  isAdmin,
  canModerate,
  joinPending,
  ownerId = null,
  memberJoinedAt,
  createdAt,
  postCount,
  roomCount,
  topics = [],
  onOpenMembers,
}: GuildFactsSheetProps) {
  const topicList = topics;
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const ownerProfiles = usePostAuthorProfiles(ownerId ? [ownerId] : []);
  const ownerProfile = ownerId ? ownerProfiles[ownerId] : null;
  const ownerLabel = ownerId
    ? (ownerProfile?.displayName ?? displayName(ownerId))
    : null;
  const ownerHandle = ownerId ? fallbackLabel(ownerId) : null;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const mode = guildModeLabel({ accessGated, memberDriven });
  const modeCopy = guildModeDescription({ accessGated, memberDriven });
  const status = viewerStatusLabel({
    isMember,
    isOwner,
    isAdmin,
    canModerate,
    joinPending,
  });
  const joinedMeta =
    isMember && memberJoinedAt
      ? guildMemberTimeMeta(memberJoinedAt, { isOwner })
      : null;
  // Owner founding day is already covered by Created — don't repeat it under You.
  const showJoinedMeta =
    joinedMeta != null &&
    !(isOwner && sameCalendarDay(memberJoinedAt, createdAt));
  const createdLabel = createdAt
    ? formatPageDrawerJoinedFullLabel(createdAt)
    : null;
  const tagLine =
    topicList.length > 0
      ? topicList.map((tag) => topicLabel(tag) ?? tag).join(' · ')
      : null;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Guild"
      copy={guildName}
      closeAriaLabel="Close guild facts"
      backdropLabel="Close guild facts"
      zIndex={57}
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-facts">
        <SheetFactSection title="Access">
          <SheetFactRow label="Mode" value={mode} />
          <SheetFactCopy>{modeCopy}</SheetFactCopy>
        </SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="Details">
          <SheetFactRow
            label="Members"
            value={
              <button
                type="button"
                className="guild-facts-link group"
                onClick={() => {
                  onOpenMembers();
                  requestClose();
                }}
              >
                <span className="guild-facts-count-value">
                  <span className="guild-facts-count">
                    {formatCompactCount(memberCount)}
                  </span>
                  <span className="guild-facts-unit">
                    {' '}
                    {memberCount === 1 ? 'member' : 'members'}
                  </span>
                </span>
                <ProtocolMotionArrow className="guild-facts-link-arrow" />
              </button>
            }
          />
          {ownerId && ownerLabel ? (
            <SheetFactRow
              label="Owner"
              value={
                <Link
                  href={portfolioPath(ownerId)}
                  className="guild-facts-link group"
                  scroll={false}
                  title={ownerHandle ?? ownerId}
                  onClick={requestClose}
                >
                  <span className="guild-facts-link-label">{ownerLabel}</span>
                  <ProtocolMotionArrow className="guild-facts-link-arrow" />
                </Link>
              }
            />
          ) : null}
          {postCount != null ? (
            <SheetFactRow
              label="Posts"
              value={
                <span className="guild-facts-count-value">
                  <span className="guild-facts-count">
                    {formatCompactCount(postCount)}
                  </span>
                  <span className="guild-facts-unit">
                    {' '}
                    {postCount === 1 ? 'post' : 'posts'}
                  </span>
                </span>
              }
            />
          ) : null}
          {roomCount != null ? (
            <SheetFactRow
              label="Rooms"
              value={
                <span className="guild-facts-count-value">
                  <span className="guild-facts-count">
                    {formatCompactCount(roomCount)}
                  </span>
                  <span className="guild-facts-unit">
                    {' '}
                    {roomCount === 1 ? 'room' : 'rooms'}
                  </span>
                </span>
              }
            />
          ) : null}
          {createdLabel ? (
            <SheetFactRow label="Created" value={createdLabel} />
          ) : null}
          {tagLine ? <SheetFactRow label="Topics" value={tagLine} /> : null}
          <SheetFactRow
            label="ID"
            value={<span className="guild-facts-id">{groupId}</span>}
          />
        </SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="You">
          <SheetFactRow label="Status" value={status} />
          {showJoinedMeta && joinedMeta ? (
            <SheetFactRow label={joinedMeta.prefix} value={joinedMeta.label} />
          ) : null}
        </SheetFactSection>
      </div>
    </OsHugSheet>
  );
}
