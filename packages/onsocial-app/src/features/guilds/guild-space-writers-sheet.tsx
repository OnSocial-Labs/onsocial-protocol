'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  CheckIcon,
  Divider,
  GlassSheet,
  ProfileAvatar,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { GuildMemberRoleBadge } from '@/features/guilds/guild-member-role-badge';
import { guildMemberRoleBucket } from '@/features/guilds/guild-member-filter';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  allowlistWriterCandidates,
  fetchGuildMemberRoleFlags,
  readGuildOwnerId,
  reconcileGuildMemberRolesFromChain,
  reconcileGuildMemberRoster,
} from '@/features/guilds/guild-member-roster';
import {
  grantGuildSpaceWrite,
  memberHasGuildSpaceWrite,
} from '@/features/guilds/guild-space-write';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { displayName, fallbackLabel } from '@/lib/profile-display';
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
  onClose: () => void;
  onSaved?: () => void;
}

export function GuildSpaceWritersSheet({
  open,
  groupId,
  spaceId,
  spaceTitle,
  memberDriven,
  onClose,
  onSaved,
}: GuildSpaceWritersSheetProps) {
  const titleId = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
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
      setMembers([]);
      setGrantedIds(new Set());
      setSelectedIds(new Set());
      setLoadState('idle');
      setPending(false);
      setError(null);
    }
  }

  useScrollLock(open || closing);

  const profiles = usePostAuthorProfiles(
    members.map((member) => member.memberId)
  );

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
      // Indexer often omits isOwner — reconcile from config, then chain admin flags.
      const reconciled = reconcileGuildMemberRoster(
        page.items ?? [],
        ownerId
      );
      const roleFlags = await fetchGuildMemberRoleFlags(
        client,
        groupId,
        reconciled
          .filter((member) => member.memberId !== ownerId)
          .map((member) => member.memberId)
      );
      const roster = allowlistWriterCandidates(
        reconcileGuildMemberRolesFromChain(reconciled, ownerId, roleFlags),
        ownerId
      );
      setMembers(roster);

      const grantFlags = await Promise.all(
        roster.map(async (member) => {
          const ok = await memberHasGuildSpaceWrite(
            client,
            groupId,
            member.memberId,
            spaceId
          );
          return ok ? member.memberId : null;
        })
      );
      const granted = new Set(
        grantFlags.filter((id): id is string => Boolean(id))
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
    if (pending || grantedIds.has(memberId)) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toGrant = [...selectedIds].filter((id) => !grantedIds.has(id));
  const canSubmit = toGrant.length > 0 && !pending && loadState === 'ready';

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

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      initialDetent="peek"
      zIndex={58}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close choose who can share"
      panelClassName="guild-add-space-sheet-panel"
      bodyClassName="guild-add-space-sheet-body"
      header={
        <>
          <div className="standing-sheet-header guild-add-space-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Who can share
                  </h2>
                  <p className="discover-sheet-subtitle">
                    {spaceTitle} · leaders can always share
                  </p>
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
      <div className="guild-space-writers-body">
        {loadState === 'loading' || loadState === 'idle' ? (
          <p className="guild-manage-sheet-empty-primary">Loading members…</p>
        ) : null}

        {loadState === 'error' && error ? (
          <p className="guild-form-error" role="alert">
            {error}
          </p>
        ) : null}

        {loadState === 'ready' && members.length === 0 ? (
          <div className="guild-manage-sheet-empty">
            <p className="guild-manage-sheet-empty-primary">
              No other members yet
            </p>
            <p className="discover-sheet-subtitle">
              Leaders can share now. Add members, then choose who can share
              here.
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

        {loadState === 'ready' && members.length > 0 ? (
          <>
            <div className="standing-list guild-space-writers-list">
              {members.map((member, index) => {
                const profile = profiles[member.memberId];
                const name =
                  profile?.displayName ?? displayName(member.memberId);
                const handle = fallbackLabel(member.memberId);
                const checked = selectedIds.has(member.memberId);
                const already = grantedIds.has(member.memberId);
                const showRoleBadge =
                  guildMemberRoleBucket(member) !== 'member';

                return (
                  <div key={member.memberId}>
                    {index > 0 ? <Divider variant="item" /> : null}
                    <button
                      type="button"
                      className={
                        checked
                          ? 'standing-row guild-space-writer-row is-selected'
                          : 'standing-row guild-space-writer-row'
                      }
                      disabled={pending || already}
                      aria-pressed={checked}
                      onClick={() => toggleMember(member.memberId)}
                    >
                      <span className="standing-row-main">
                        <ProfileAvatar
                          src={profile?.avatarUrl ?? null}
                          fallbackInitial={name}
                          size="lg"
                          className="standing-row-avatar-slot"
                        />
                        <span className="standing-row-copy">
                          <span className="standing-row-head">
                            <span className="standing-row-name-row guild-member-row-name-row">
                              <span className="standing-row-name">{name}</span>
                              {showRoleBadge ? (
                                <GuildMemberRoleBadge member={member} />
                              ) : null}
                            </span>
                            <span className="standing-row-handle">
                              {already ? 'Can share' : `@${handle}`}
                            </span>
                          </span>
                        </span>
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
                  </div>
                );
              })}
            </div>

            {error ? (
              <p className="guild-form-error" role="alert">
                {error}
              </p>
            ) : null}

            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              {canSubmit || pending ? (
                <OsSheetAction
                  type="button"
                  variant="primary"
                  ready={canSubmit}
                  pending={pending}
                  pendingLabel={memberDriven ? 'Proposing…' : 'Allowing…'}
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                >
                  {toGrant.length > 1
                    ? `Allow ${toGrant.length}`
                    : 'Allow'}
                </OsSheetAction>
              ) : null}
              <OsSheetAction
                type="button"
                variant={canSubmit || pending ? 'ghost' : 'primary'}
                ready={!pending}
                disabled={pending}
                onClick={requestClose}
              >
                {toGrant.length > 0 ? 'Skip for now' : 'Done'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : null}
      </div>
    </GlassSheet>
  );
}
