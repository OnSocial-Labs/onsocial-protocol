'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Proposal } from '@onsocial/sdk';
import { Divider, OsHugSheet, PulsingDots } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { guildProposalPresentation } from '@/features/guilds/guild-proposal-display';
import {
  deriveGuildProposalAbstainers,
  deriveGuildProposalVoteEntries,
  type GuildProposalVoteEntry,
} from '@/features/guilds/guild-proposal-voters';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { portfolioPath } from '@/lib/overlay-routes';
import { SHEET_Z } from '@/lib/sheet-z';

interface GuildProposalVotersSheetProps {
  open: boolean;
  groupId: string;
  proposal: Proposal | null;
  /** Past the voting period or terminal — non-voters did not vote. */
  votingClosed: boolean;
  /** Target's display name when already loaded — keeps the headline friendly. */
  targetName?: string | null;
  onClose: () => void;
}

/** Voter roster hug drawer — same standing-row chrome as the DAO sheet. */
export function GuildProposalVotersSheet({
  open,
  groupId,
  proposal,
  votingClosed,
  targetName,
  onClose,
}: GuildProposalVotersSheetProps) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [entries, setEntries] = useState<GuildProposalVoteEntry[]>([]);
  const [abstainers, setAbstainers] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const sheetOpen = open && !closing;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setEntries([]);
      setAbstainers([]);
      setLoadState('idle');
    }
  }

  const profiles = usePostAuthorProfiles([
    ...entries.map((entry) => entry.voter),
    ...abstainers,
  ]);

  const load = useCallback(async () => {
    if (!proposal) return;
    setLoadState('loading');
    try {
      const client = createReadOnlyOnSocialClient();
      const [votes, page] = await Promise.all([
        client.query.governance.votes(groupId, proposal.id),
        client.query.groups.membersOf(groupId, { limit: 120 }),
      ]);
      const derived = deriveGuildProposalVoteEntries(votes);
      setEntries(derived);
      setAbstainers(
        deriveGuildProposalAbstainers(page.items ?? [], derived)
      );
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [groupId, proposal]);

  useEffect(() => {
    if (!open || !proposal) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, open, proposal]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const presentation = proposal
    ? guildProposalPresentation(proposal, targetName)
    : null;
  const title = proposal ? `Votes · #${proposal.sequence_number}` : 'Votes';
  const noVoteLabel = votingClosed ? 'Did not vote' : "Hasn't voted";
  const rows: Array<{ accountId: string; approve: boolean | null }> = [
    ...entries.map((entry) => ({
      accountId: entry.voter,
      approve: entry.approve as boolean | null,
    })),
    ...abstainers.map((accountId) => ({ accountId, approve: null })),
  ];

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      chrome="facts"
      label={title}
      {...(presentation?.headline ? { copy: presentation.headline } : {})}
      closeAriaLabel="Close votes"
      backdropLabel="Close votes"
      zIndex={SHEET_Z.list}
      initialDetent="peek"
      peekRatio={0.55}
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
      bodyClassName="guild-facts-sheet-body protocol-voters-sheet-body"
    >
      {loadState === 'loading' || loadState === 'idle' ? (
        <div className="guild-manage-sheet-state">
          <PulsingDots size="sm" />
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="guild-manage-sheet-state">
          <p className="guild-form-error" role="alert">
            Could not load votes.
          </p>
          <OsEmptyAction onClick={() => void load()}>Try again</OsEmptyAction>
        </div>
      ) : null}

      {loadState === 'ready' && rows.length === 0 ? (
        <p className="protocol-compose-note">No votes yet.</p>
      ) : null}

      {loadState === 'ready' && rows.length > 0 ? (
        <>
          {entries.length === 0 ? (
            <p className="protocol-compose-note">No votes yet.</p>
          ) : null}
          <div className="standing-list protocol-voters-list">
            {rows.map((row, index) => {
              const profile = profiles[row.accountId];
              const noVote = row.approve == null;
              return (
                <div key={`${row.accountId}-${row.approve ?? 'no-vote'}`}>
                  {index > 0 ? <Divider variant="item" /> : null}
                  <div
                    className={`standing-row protocol-voter-row${
                      noVote ? ' is-no-vote' : ''
                    }`}
                  >
                    <Link
                      href={portfolioPath(row.accountId)}
                      className="standing-row-main"
                      scroll={false}
                    >
                      <StandingIdentity
                        accountId={row.accountId}
                        profileName={profile?.displayName}
                        avatarUrl={profile?.avatarUrl}
                      />
                    </Link>
                    <div className="standing-row-aside protocol-voter-row-aside">
                      <span
                        className={
                          noVote
                            ? 'protocol-pill is-no-vote'
                            : `protocol-pill is-vote ${
                                row.approve ? 'is-approve' : 'is-reject'
                              }`
                        }
                      >
                        {noVote
                          ? noVoteLabel
                          : row.approve
                            ? 'Support'
                            : 'Oppose'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </OsHugSheet>
  );
}
