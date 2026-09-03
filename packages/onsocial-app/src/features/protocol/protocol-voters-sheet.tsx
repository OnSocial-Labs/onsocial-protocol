'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import {
  Divider,
  OsHugSheet,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import type {
  ProtocolDaoPolicy,
  ProtocolDaoVote,
} from '@/features/protocol/types';
import { portfolioPath } from '@/lib/overlay-routes';

type ProfilePeek = {
  displayName?: string | null;
  avatarUrl?: string | null;
};

/**
 * Voter roster hug drawer — standing-row profile chrome (same as guild members).
 */
export function ProtocolVotersSheet({
  open,
  onClose,
  proposalId,
  headline,
  voteEntries,
  abstainers,
  profiles,
  showProtocolRoleMarks = false,
  votingClosed = false,
}: {
  open: boolean;
  onClose: () => void;
  proposalId: number | null;
  headline?: string | null;
  voteEntries: Array<[string, ProtocolDaoVote]>;
  abstainers: string[];
  profiles: Record<string, ProfilePeek | undefined>;
  daoPolicy?: ProtocolDaoPolicy | null;
  /** Protocol Governance / Treasury only. */
  showProtocolRoleMarks?: boolean;
  /** Closed review window or terminal status — non-voters did not vote. */
  votingClosed?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const rows: Array<{
    accountId: string;
    vote: ProtocolDaoVote | null;
  }> = [
    ...voteEntries.map(([accountId, vote]) => ({ accountId, vote })),
    ...abstainers.map((accountId) => ({ accountId, vote: null })),
  ];

  const title = proposalId != null ? `Votes · #${proposalId}` : 'Votes';
  const copy = headline?.trim() || null;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={title}
      {...(copy ? { copy } : {})}
      closeAriaLabel="Close votes"
      backdropLabel="Close votes"
      zIndex={PROTOCOL_TASK_SHEET_Z}
      initialDetent="peek"
      peekRatio={0.55}
      panelClassName="guild-facts-sheet-panel os-sheet-cap-standard"
      bodyClassName="protocol-voters-sheet-body guild-facts-sheet-body"
    >
      {rows.length === 0 ? (
        <p className="protocol-compose-note">No votes yet.</p>
      ) : (
        <div className="standing-list protocol-voters-list">
          {rows.map((row, index) => {
            const profile = profiles[row.accountId];
            const noVote = row.vote == null;
            const noVoteLabel = votingClosed ? 'Did not vote' : "Hasn't voted";
            return (
              <div key={`${row.accountId}-${row.vote ?? 'no-vote'}`}>
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
                      nameTrailing={
                        showProtocolRoleMarks ? (
                          <ProtocolNameTrailing accountId={row.accountId} />
                        ) : null
                      }
                    />
                  </Link>
                  <div className="standing-row-aside protocol-voter-row-aside">
                    <span
                      className={
                        noVote
                          ? 'protocol-pill is-no-vote'
                          : `protocol-pill is-vote is-${row.vote!.toLowerCase()}`
                      }
                    >
                      {noVote ? noVoteLabel : row.vote}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OsHugSheet>
  );
}
