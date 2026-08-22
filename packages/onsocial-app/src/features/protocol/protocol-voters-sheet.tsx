'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  Divider,
  OsHugSheet,
  StandingIdentity,
} from '@onsocial/ui';
import { ProtocolCouncilGuardianMark } from '@/features/protocol/protocol-council-guardian-mark';
import {
  protocolCouncilGuardianRoleByAccount,
} from '@/features/protocol/protocol-council-guardian';
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
  daoPolicy = null,
  showProtocolRoleMarks = false,
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
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const roleByAccount = useMemo(
    () =>
      showProtocolRoleMarks
        ? protocolCouncilGuardianRoleByAccount(daoPolicy)
        : null,
    [daoPolicy, showProtocolRoleMarks]
  );

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

  const title =
    proposalId != null ? `Votes · #${proposalId}` : 'Votes';
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
      panelClassName="guild-facts-sheet-panel"
      bodyClassName="protocol-voters-sheet-body guild-facts-sheet-body"
    >
      {rows.length === 0 ? (
        <p className="protocol-compose-note">No votes yet.</p>
      ) : (
        <div className="standing-list protocol-voters-list">
          {rows.map((row, index) => {
            const profile = profiles[row.accountId];
            const pending = row.vote == null;
            return (
              <div key={`${row.accountId}-${row.vote ?? 'pending'}`}>
                {index > 0 ? <Divider variant="item" /> : null}
                <div
                  className={`standing-row protocol-voter-row${
                    pending ? ' is-pending' : ''
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
                        <ProtocolCouncilGuardianMark
                          roleId={roleByAccount?.get(
                            row.accountId.trim().toLowerCase()
                          )}
                        />
                      }
                    />
                  </Link>
                  <div className="standing-row-aside protocol-voter-row-aside">
                    <span
                      className={
                        pending
                          ? 'protocol-pill'
                          : `protocol-pill is-vote is-${row.vote!.toLowerCase()}`
                      }
                    >
                      {pending ? 'Pending' : row.vote}
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
