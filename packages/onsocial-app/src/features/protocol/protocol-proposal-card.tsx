'use client';

import { useMemo, useState } from 'react';
import { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
} from '@/features/protocol/types';
import { fallbackLabel } from '@/lib/profile-display';

export function ProtocolProposalCard({
  application,
  daoPolicy,
  accountId,
  nowMs,
  onOpenActions,
}: {
  application: ProtocolApplication;
  daoPolicy: ProtocolDaoPolicy | null;
  accountId: string | null;
  nowMs: number;
  onOpenActions: () => void;
}) {
  const [votersOpen, setVotersOpen] = useState(false);
  const view = useMemo(
    () =>
      deriveProtocolProposalView({
        application,
        accountId,
        daoPolicy,
        nowMs,
      }),
    [application, accountId, daoPolicy, nowMs]
  );

  const progress = view.votingProgress;
  const total =
    progress.totalWeight && progress.totalWeight > 0
      ? progress.totalWeight
      : progress.approvals + progress.rejects + progress.removes;
  const approvePct = total > 0 ? (progress.approvals / total) * 100 : 0;
  const rejectPct = total > 0 ? (progress.rejects / total) * 100 : 0;
  const removePct = total > 0 ? (progress.removes / total) * 100 : 0;
  const pendingPct = Math.max(0, 100 - approvePct - rejectPct - removePct);
  const thresholdPct =
    progress.threshold != null &&
    progress.totalWeight != null &&
    progress.totalWeight > 0
      ? (progress.threshold / progress.totalWeight) * 100
      : null;
  const votedAccounts = new Set(
    view.voteEntries.map(([id]) => id.trim().toLowerCase())
  );
  const abstainers = view.eligibleVoters.filter(
    (id) => !votedAccounts.has(id.trim().toLowerCase())
  );
  const canAct = view.canApprove || view.canReject || view.canFinalize;
  const showVoters = view.voteEntries.length > 0 || abstainers.length > 0;

  return (
    <article
      className={`protocol-card is-${view.statusTone}`}
      aria-labelledby={`protocol-card-${application.app_id}`}
    >
      <header className="protocol-card-strip">
        <div className="protocol-card-strip-main">
          {view.proposalId != null ? (
            <span className="protocol-card-id">#{view.proposalId}</span>
          ) : null}
          <span className="protocol-pill">{view.actionBadge}</span>
          <span className={`protocol-pill is-status is-${view.statusTone}`}>
            {view.statusLabel}
          </span>
        </div>
        <div className="protocol-card-strip-meta">
          {view.submission ? (
            <span title={view.submission.absolute}>
              Submitted {view.submission.relative}
            </span>
          ) : null}
          {view.deadline ? (
            <span
              className={view.deadline.expired ? 'is-urgent' : undefined}
              title={view.deadline.absolute}
            >
              {view.deadline.prefix} {view.deadline.relative}
            </span>
          ) : null}
        </div>
      </header>

      <div className="protocol-card-body">
        <h2
          id={`protocol-card-${application.app_id}`}
          className="protocol-card-title"
        >
          {view.headline}
        </h2>

        {view.proposer ? (
          <p className="protocol-card-proposer">
            Proposed by @{fallbackLabel(view.proposer)}
          </p>
        ) : null}

        {(view.targetAccount || view.targetMethod) && (
          <dl className="protocol-card-targets">
            {view.targetAccount ? (
              <div>
                <dt>Target</dt>
                <dd>@{fallbackLabel(view.targetAccount)}</dd>
              </div>
            ) : null}
            {view.targetMethod ? (
              <div>
                <dt>Method</dt>
                <dd>{view.targetMethod.replace(/_/g, ' ')}</dd>
              </div>
            ) : null}
          </dl>
        )}

        {view.description ? (
          <p className="protocol-card-description">{view.description}</p>
        ) : null}

        <div className="protocol-card-votes">
          <div className="protocol-card-vote-counts">
            <span className="is-approve">{view.approveVotes} approve</span>
            <span className="is-reject">{view.rejectVotes} reject</span>
            {view.removeVotes > 0 ? (
              <span className="is-remove">{view.removeVotes} remove</span>
            ) : null}
            {progress.threshold != null && progress.totalWeight != null ? (
              <span className="protocol-card-vote-rule">
                {progress.threshold}/{progress.totalWeight} required
              </span>
            ) : null}
          </div>
          {total > 0 ? (
            <div className="protocol-card-vote-bar" aria-hidden>
              <span className="is-approve" style={{ width: `${approvePct}%` }} />
              <span className="is-reject" style={{ width: `${rejectPct}%` }} />
              <span className="is-remove" style={{ width: `${removePct}%` }} />
              <span className="is-pending" style={{ width: `${pendingPct}%` }} />
              {thresholdPct != null && thresholdPct > 0 && thresholdPct < 100 ? (
                <i style={{ left: `${thresholdPct}%` }} />
              ) : null}
            </div>
          ) : null}
          {view.currentVote ? (
            <p className="protocol-card-your-vote">
              You voted {view.currentVote}
            </p>
          ) : null}
        </div>

        {showVoters ? (
          <div className="protocol-card-voters">
            <button
              type="button"
              className="protocol-card-voters-toggle"
              aria-expanded={votersOpen}
              onClick={() => setVotersOpen((open) => !open)}
            >
              Votes · {view.voteEntries.length}
              {view.eligibleVoters.length > 0
                ? `/${view.eligibleVoters.length}`
                : ''}
            </button>
            {votersOpen ? (
              <ul className="protocol-card-voter-list">
                {view.voteEntries.map(([account, vote]) => (
                  <li key={`${account}-${vote}`}>
                    <span>@{fallbackLabel(account)}</span>
                    <span className={`protocol-pill is-vote is-${vote.toLowerCase()}`}>
                      {vote}
                    </span>
                  </li>
                ))}
                {abstainers.map((account) => (
                  <li key={`abstain-${account}`} className="is-abstain">
                    <span>@{fallbackLabel(account)}</span>
                    <span className="protocol-pill">Pending</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {canAct ? (
        <footer className="protocol-card-footer">
          <button
            type="button"
            className="protocol-card-act"
            onClick={onOpenActions}
          >
            {view.canFinalize ? view.finalizeLabel : 'Vote'}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
