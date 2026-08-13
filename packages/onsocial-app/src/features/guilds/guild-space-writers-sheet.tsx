'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import { CheckIcon, Divider, OsHugSheet } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-action';
import {
  StandingIdentity,
  standingIdentityLabel,
} from '@/components/ui/standing-identity';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { GuildMemberRoleBadge } from '@/features/guilds/guild-member-role-badge';
import { guildMemberRoleBucket } from '@/features/guilds/guild-member-filter';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  allowlistLeaders,
  allowlistWriterCandidates,
  readGuildOwnerId,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import {
  grantGuildSpaceWrite,
  loadGuildSpaceWriteGrantees,
  revokeGuildSpaceWrite,
} from '@/features/guilds/guild-space-write';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

interface GuildSpaceWritersSheetProps {
  open: boolean;
  groupId: string;
  spaceId: string;
  spaceTitle: string;
  memberDriven: boolean;
  /** Leaders can grant/revoke; everyone else gets a read-only Sharing list. */
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function GuildSpaceWritersSheet({
  open,
  groupId,
  spaceId,
  spaceTitle,
  memberDriven,
  canEdit = true,
  onClose,
  onSaved,
}: GuildSpaceWritersSheetProps) {
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [leaders, setLeaders] = useState<GroupMemberRow[]>([]);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setLeaders([]);
      setMembers([]);
      setGrantedIds(new Set());
      setSelectedIds(new Set());
      setLoadState('idle');
      setPending(false);
      setError(null);
    }
  }

  const profiles = usePostAuthorProfiles([
    ...leaders.map((member) => member.memberId),
    ...members.map((member) => member.memberId),
  ]);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const client = createReadOnlyOnSocialClient();
      const [config, page] = await Promise.all([
        client.groups.getConfig(groupId),
        client.query.groups.membersOf(groupId, { limit: 120 }),
      ]);
      const ownerId = readGuildOwnerId(config);
      // Indexer isAdmin/canModerate — leaders vs grant candidates without N× RPCs.
      const reconciled = reconcileGuildMemberRoster(page.items ?? [], ownerId);
      const leaderRows = allowlistLeaders(reconciled, ownerId);
      const roster = allowlistWriterCandidates(reconciled, ownerId);
      setLeaders(leaderRows);
      setMembers(roster);

      // Indexer forPath fold — paint without N× permissions.has RPCs.
      const granted = await loadGuildSpaceWriteGrantees(
        client,
        groupId,
        spaceId
      );
      setGrantedIds(granted);
      setSelectedIds(new Set(granted));
      setLoadState('ready');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load members.'
      );
    }
  }, [groupId, spaceId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const toggleMember = (memberId: string) => {
    if (!canEdit || pending) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toGrant = canEdit
    ? [...selectedIds].filter((id) => !grantedIds.has(id))
    : [];
  const toRevoke = canEdit
    ? [...grantedIds].filter((id) => !selectedIds.has(id))
    : [];
  const changeCount = toGrant.length + toRevoke.length;
  const canSubmit =
    canEdit && changeCount > 0 && !pending && loadState === 'ready';

  const candidateRows = canEdit
    ? [...members].sort((a, b) => {
        const aGranted = grantedIds.has(a.memberId) ? 0 : 1;
        const bGranted = grantedIds.has(b.memberId) ? 0 : 1;
        return aGranted - bGranted;
      })
    : members.filter((member) => grantedIds.has(member.memberId));

  const hasList = leaders.length > 0 || candidateRows.length > 0;
  const showEmptyManage = canEdit && leaders.length > 0 && members.length === 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const { client, accountId, wallet } = await getClient();

      for (const memberId of toGrant) {
        const response = await grantGuildSpaceWrite({
          client,
          accountId,
          wallet,
          groupId,
          spaceId,
          memberId,
          memberDriven,
          spaceTitle,
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: memberDriven
            ? txToastConfirming.proposingGuildSpaceWriter
            : txToastConfirming.grantingGuildSpaceWriter,
          successMessage: memberDriven
            ? txToastSuccess.guildSpaceWriterProposed
            : txToastSuccess.guildSpaceWriterGranted,
          failureMessage: txToastError.guildSpaceWriterFailed,
        });
        if (!confirmed) {
          setPending(false);
          return;
        }
      }

      for (const memberId of toRevoke) {
        const response = await revokeGuildSpaceWrite({
          client,
          accountId,
          wallet,
          groupId,
          spaceId,
          memberId,
          memberDriven,
          spaceTitle,
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: memberDriven
            ? txToastConfirming.proposingGuildSpaceWriterRevoke
            : txToastConfirming.revokingGuildSpaceWriter,
          successMessage: memberDriven
            ? txToastSuccess.guildSpaceWriterRevokeProposed
            : txToastSuccess.guildSpaceWriterRevoked,
          failureMessage: txToastError.guildSpaceWriterFailed,
        });
        if (!confirmed) {
          setPending(false);
          return;
        }
      }

      onSaved?.();
      setClosing(true);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update who can share.'
      );
    } finally {
      setPending(false);
    }
  };

  const renderLeaderRow = (member: GroupMemberRow, index: number) => {
    const profile = profiles[member.memberId];
    const { label } = standingIdentityLabel(
      member.memberId,
      profile?.displayName
    );

    return (
      <div key={`leader-${member.memberId}`}>
        {index > 0 ? <Divider variant="item" /> : null}
        <div
          className="standing-row guild-space-writer-row is-selected is-leader"
          aria-label={`${label}, leader, always can share`}
        >
          <span className="standing-row-main">
            <StandingIdentity
              accountId={member.memberId}
              profileName={profile?.displayName}
              avatarUrl={profile?.avatarUrl}
              nameRowClassName="guild-member-row-name-row"
              nameTrailing={
                <>
                  <GuildMemberRoleBadge member={member} />
                  <span className="guild-space-writer-status">Always</span>
                </>
              }
            />
          </span>
        </div>
      </div>
    );
  };

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      label="Who can share"
      copy={spaceTitle}
      closeAriaLabel="Close who can share"
      backdropLabel="Close who can share"
      zIndex={58}
      presentation="swap"
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="guild-facts-sheet-body"
    >
      <div className="guild-space-writers-body">
        {loadState === 'loading' || loadState === 'idle' ? (
          <p className="guild-manage-sheet-empty-primary">Loading members…</p>
        ) : null}

        {loadState === 'error' && error ? (
          <p className="guild-form-error" role="alert">
            {error}
          </p>
        ) : null}

        {loadState === 'ready' && !hasList ? (
          <div className="guild-manage-sheet-empty">
            <p className="guild-manage-sheet-empty-primary">No members yet</p>
            <p className="discover-sheet-subtitle">
              Add members, then choose who can share here.
            </p>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={requestClose}
              >
                Done
              </OsSheetAction>
            </OsSheetActions>
          </div>
        ) : null}

        {loadState === 'ready' && hasList ? (
          <>
            <div className="standing-list guild-space-writers-list">
              {leaders.map((member, index) => renderLeaderRow(member, index))}
              {candidateRows.map((member, index) => {
                const profile = profiles[member.memberId];
                const { label } = standingIdentityLabel(
                  member.memberId,
                  profile?.displayName
                );
                const checked = selectedIds.has(member.memberId);
                const already = grantedIds.has(member.memberId);
                const removing = canEdit && already && !checked;
                const showRoleBadge =
                  guildMemberRoleBucket(member) !== 'member';
                const rowIndex = leaders.length + index;
                const rowClass = checked
                  ? 'standing-row guild-space-writer-row is-selected'
                  : removing
                    ? 'standing-row guild-space-writer-row is-removing'
                    : 'standing-row guild-space-writer-row';

                return (
                  <div key={member.memberId}>
                    {rowIndex > 0 ? <Divider variant="item" /> : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className={rowClass}
                        disabled={pending}
                        aria-pressed={checked}
                        aria-label={
                          removing
                            ? `${label}, will remove sharing`
                            : already && checked
                              ? `${label}, sharing`
                              : checked
                                ? `${label}, selected`
                                : `${label}, not selected`
                        }
                        onClick={() => toggleMember(member.memberId)}
                      >
                        <span className="standing-row-main">
                          <StandingIdentity
                            accountId={member.memberId}
                            profileName={profile?.displayName}
                            avatarUrl={profile?.avatarUrl}
                            nameRowClassName="guild-member-row-name-row"
                            nameTrailing={
                              <>
                                {showRoleBadge ? (
                                  <GuildMemberRoleBadge member={member} />
                                ) : null}
                                {already && checked ? (
                                  <span className="guild-space-writer-status">
                                    Sharing
                                  </span>
                                ) : null}
                                {removing ? (
                                  <span className="guild-space-writer-status is-removing">
                                    Remove
                                  </span>
                                ) : null}
                              </>
                            }
                          />
                        </span>
                        <span
                          className={
                            checked
                              ? 'guild-space-writer-check is-on'
                              : 'guild-space-writer-check'
                          }
                          aria-hidden
                        >
                          {checked ? <CheckIcon /> : null}
                        </span>
                      </button>
                    ) : (
                      <div
                        className="standing-row guild-space-writer-row is-selected"
                        aria-label={`${label}, can share`}
                      >
                        <span className="standing-row-main">
                          <StandingIdentity
                            accountId={member.memberId}
                            profileName={profile?.displayName}
                            avatarUrl={profile?.avatarUrl}
                            nameRowClassName="guild-member-row-name-row"
                            nameTrailing={
                              <>
                                {showRoleBadge ? (
                                  <GuildMemberRoleBadge member={member} />
                                ) : null}
                                <span className="guild-space-writer-status">
                                  Sharing
                                </span>
                              </>
                            }
                          />
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {showEmptyManage ? (
              <p className="discover-sheet-subtitle guild-space-writers-empty-note">
                Add members, then choose who can share here.
              </p>
            ) : null}

            {error ? (
              <p className="guild-form-error" role="alert">
                {error}
              </p>
            ) : null}

            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              {canEdit && (canSubmit || pending) ? (
                <OsSheetAction
                  type="button"
                  variant="primary"
                  ready={canSubmit}
                  pending={pending}
                  pendingLabel={
                    memberDriven
                      ? 'Proposing…'
                      : toRevoke.length > 0 && toGrant.length === 0
                        ? 'Removing…'
                        : toGrant.length > 0 && toRevoke.length === 0
                          ? 'Allowing…'
                          : 'Saving…'
                  }
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                >
                  {toGrant.length > 0 && toRevoke.length > 0
                    ? `Save ${changeCount}`
                    : toRevoke.length > 1
                      ? `Remove ${toRevoke.length}`
                      : toRevoke.length === 1
                        ? 'Remove'
                        : toGrant.length > 1
                          ? `Allow ${toGrant.length}`
                          : 'Allow'}
                </OsSheetAction>
              ) : null}
              <OsSheetAction
                type="button"
                variant={
                  canEdit && (canSubmit || pending) ? 'ghost' : 'primary'
                }
                ready={!pending}
                disabled={pending}
                onClick={requestClose}
              >
                {canEdit && changeCount > 0 ? 'Cancel' : 'Done'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : null}
      </div>
    </OsHugSheet>
  );
}
