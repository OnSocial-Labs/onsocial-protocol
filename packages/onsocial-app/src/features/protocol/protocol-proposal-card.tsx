'use client';

import { useMemo, useState } from 'react';
import {
  CheckIcon,
  MultiplyIcon,
  OsProposalCard,
  OsProposalCardBody,
  OsProposalCardFooter,
  OsProposalCardSep,
  OsProposalCardStrip,
  OsProposalCardStripEnd,
  OsProposalCardStripMain,
  OsProposalCardStripStart,
  OsSheetAction,
  OsSheetActions,
  UserMinusIcon,
  osProposalCardActionsClassName,
} from '@onsocial/ui';
import { ProtocolAccountChip } from '@/features/protocol/protocol-account-chip';
import { deriveProtocolProposalView } from '@/features/protocol/protocol-card-view';
import { ProtocolOnChainSheet } from '@/features/protocol/protocol-on-chain-sheet';
import { splitRoutingTargetDisplay } from '@/features/protocol/protocol-proposal-routing-display';
import { protocolCouncilGuardianRoleByAccount } from '@/features/protocol/protocol-council-guardian';
import { ProtocolVotersSheet } from '@/features/protocol/protocol-voters-sheet';
import type {
  ProtocolApplication,
  ProtocolDaoPolicy,
} from '@/features/protocol/types';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { isProtocolFacePairDao } from '@/lib/portfolio-dao-entity';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

function targetEyebrow(kind: string | null): string | null {
  switch (kind) {
    case 'role':
      return 'Role';
    case 'amount':
      return 'Amount';
    case 'contract':
      return 'Contract';
    case 'code_hash':
      return 'Code hash';
    case 'community':
      return 'Community';
    case 'routing':
      return 'Routing';
    case 'season':
      return 'Season';
    default:
      return null;
  }
}

/**
 * Protocol / treasury proposal card — shared OsProposalCard bordered chrome with
 * status-tinted top lip, identity, votes; vote/finalize via drawer.
 */
export function ProtocolProposalCard({
  application,
  daoPolicy,
  daoAccountId,
  accountId,
  nowMs,
  focused = false,
  shareHref,
  onOpenActions,
  onCopyLink,
}: {
  application: ProtocolApplication;
  daoPolicy: ProtocolDaoPolicy | null;
  /** When set, Guardian/Council marks show on protocol DAO cards only. */
  daoAccountId?: string | null;
  accountId: string | null;
  nowMs: number;
  focused?: boolean;
  shareHref?: string | null;
  onOpenActions: () => void;
  onCopyLink?: () => void;
}) {
  const [descOpen, setDescOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [onChainOpen, setOnChainOpen] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
  const showProtocolRoleMarks = Boolean(
    daoAccountId && isProtocolFacePairDao(daoAccountId)
  );
  const protocolRoleByAccount = useMemo(
    () =>
      showProtocolRoleMarks
        ? protocolCouncilGuardianRoleByAccount(daoPolicy)
        : null,
    [daoPolicy, showProtocolRoleMarks]
  );
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

  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    if (view.subjectAccount) ids.add(view.subjectAccount);
    if (view.proposer) ids.add(view.proposer);
    for (const [id] of view.voteEntries) ids.add(id);
    for (const id of view.eligibleVoters) ids.add(id);
    return [...ids];
  }, [
    view.subjectAccount,
    view.proposer,
    view.voteEntries,
    view.eligibleVoters,
  ]);
  const profiles = usePostAuthorProfiles(profileIds);

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
  const canAct =
    view.canApprove || view.canReject || view.canRemove || view.canFinalize;
  const hasOnChain = Boolean(view.proposal) || Boolean(view.onChainAction);
  const showVoters = view.voteEntries.length > 0 || abstainers.length > 0;
  const eyebrow = targetEyebrow(view.targetKind);
  const showProposer =
    Boolean(view.proposer) &&
    (view.showProposerAsSelf ||
      view.showProposerSeparately ||
      !view.subjectAccount ||
      view.subjectAccount.toLowerCase() !== view.proposer!.toLowerCase());
  const routingDisplay =
    view.targetKind === 'routing' && view.targetValue
      ? splitRoutingTargetDisplay(view.targetValue)
      : null;
  const hasIdentity =
    Boolean(view.subjectAccount) ||
    Boolean(view.subjectText) ||
    Boolean(view.targetValue) ||
    Boolean(view.targetAccount);
  const description =
    view.description && view.description.trim() !== view.headline.trim()
      ? view.description.trim()
      : null;
  const descriptionLong = Boolean(description && description.length > 140);

  return (
    <>
      <OsProposalCard
        surface="bordered"
        id={
          view.proposalId != null
            ? `protocol-proposal-${view.proposalId}`
            : undefined
        }
        className={`protocol-card is-${view.statusTone}${focused ? ' is-focused' : ''}`}
        aria-labelledby={`protocol-card-${application.app_id}`}
      >
        <OsProposalCardStrip className="protocol-card-strip">
          <OsProposalCardStripStart>
            <OsProposalCardStripMain className="protocol-card-strip-main">
              {view.proposalId != null ? (
                <span className="protocol-card-id">#{view.proposalId}</span>
              ) : null}
              {view.actionBadge ? (
                <>
                  <OsProposalCardSep />
                  <span className="protocol-card-action-badge">
                    {view.actionBadge}
                  </span>
                </>
              ) : null}
            </OsProposalCardStripMain>
            {view.submission ? (
              <span
                className="protocol-card-strip-meta-line"
                title={view.submission.absolute}
              >
                Submitted {view.submission.relative}
              </span>
            ) : null}
          </OsProposalCardStripStart>
          <OsProposalCardStripEnd>
            <span
              className={`protocol-card-strip-status is-${view.statusTone}`}
            >
              {view.statusLabel}
            </span>
            {view.deadline ? (
              <span
                className={`protocol-card-strip-meta-line${
                  view.deadline.expired ? ' is-urgent' : ''
                }`}
                title={view.deadline.absolute}
              >
                {view.deadline.prefix} {view.deadline.relative}
              </span>
            ) : null}
          </OsProposalCardStripEnd>
        </OsProposalCardStrip>

      <OsProposalCardBody className="protocol-card-body">
        <h2
          id={`protocol-card-${application.app_id}`}
          className="protocol-card-sr-title"
        >
          {view.headline}
        </h2>
        {hasIdentity ? (
          <div className="protocol-card-identity">
            <div className="protocol-card-identity-subject">
              {view.subjectAccount ? (
                <>
                  {view.subjectEyebrow ? (
                    <span className="protocol-card-eyebrow">
                      {view.subjectEyebrow}
                    </span>
                  ) : null}
                  <ProtocolAccountChip
                    accountId={view.subjectAccount}
                    profileName={profiles[view.subjectAccount]?.displayName}
                    avatarUrl={profiles[view.subjectAccount]?.avatarUrl}
                    dense
                    href={portfolioPath(view.subjectAccount)}
                    protocolRoleId={protocolRoleByAccount?.get(
                      view.subjectAccount.trim().toLowerCase()
                    )}
                  />
                </>
              ) : view.subjectText ? (
                <>
                  {view.subjectEyebrow ? (
                    <span className="protocol-card-eyebrow">
                      {view.subjectEyebrow}
                    </span>
                  ) : null}
                  <span className="protocol-card-identity-text">
                    {view.subjectText}
                  </span>
                </>
              ) : (
                <p className="protocol-card-title">{view.headline}</p>
              )}
            </div>

            {view.targetValue || view.targetAccount ? (
              <div className="protocol-card-identity-target">
                <span className="protocol-card-eyebrow">
                  {eyebrow ?? 'Target'}
                </span>
                {routingDisplay ? (
                  <span className="protocol-card-routing-value">
                    {routingDisplay.minLabel ? (
                      <span className="protocol-card-identity-value">
                        {routingDisplay.minLabel}
                      </span>
                    ) : null}
                    {routingDisplay.routingParts.length > 0 ? (
                      <span className="protocol-card-routing-parts">
                        {routingDisplay.routingParts.map((part) => (
                          <span
                            key={part}
                            className="protocol-card-identity-value is-muted"
                          >
                            {part}
                          </span>
                        ))}
                      </span>
                    ) : routingDisplay.routingLabel ? (
                      <span className="protocol-card-identity-value is-muted">
                        {routingDisplay.routingLabel}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span
                    className={`protocol-card-identity-value${
                      view.targetKind === 'code_hash' ? ' is-mono' : ''
                    }`}
                    title={
                      view.targetAccount && view.targetValue
                        ? `${view.targetValue} · ${view.targetAccount}`
                        : (view.targetValue ?? view.targetAccount ?? undefined)
                    }
                  >
                    {view.targetValue ??
                      `@${fallbackLabel(view.targetAccount!)}`}
                  </span>
                )}
                {view.targetMethod ? (
                  <span className="protocol-card-identity-method">
                    {view.targetMethod.replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="protocol-card-title">{view.headline}</p>
        )}

        {showProposer && view.proposer ? (
          <div className="protocol-card-proposer-row">
            <span className="protocol-card-eyebrow">Proposer</span>
            {view.showProposerAsSelf ? (
              <span className="protocol-card-identity-text">Self</span>
            ) : (
              <ProtocolAccountChip
                accountId={view.proposer}
                profileName={profiles[view.proposer]?.displayName}
                avatarUrl={profiles[view.proposer]?.avatarUrl}
                dense
                href={portfolioPath(view.proposer)}
                protocolRoleId={protocolRoleByAccount?.get(
                  view.proposer.trim().toLowerCase()
                )}
              />
            )}
          </div>
        ) : null}

        {description ? (
          <div className="protocol-card-description-block">
            <p
              className={`protocol-card-description${
                descriptionLong && !descOpen ? ' is-clamped' : ''
              }`}
            >
              {description}
            </p>
            {descriptionLong ? (
              <button
                type="button"
                className="protocol-card-description-more"
                aria-expanded={descOpen}
                onClick={() => setDescOpen((open) => !open)}
              >
                {descOpen ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="protocol-card-votes">
          <div className="protocol-card-vote-counts">
            <span
              className={`is-approve${
                view.currentVote === 'Approve' ? ' is-confirmed' : ''
              }`}
            >
              <CheckIcon className="protocol-card-vote-icon" aria-hidden />
              <span>{view.approveVotes}</span>
            </span>
            <span
              className={`is-reject${
                view.currentVote === 'Reject' ? ' is-confirmed' : ''
              }`}
            >
              <MultiplyIcon className="protocol-card-vote-icon" aria-hidden />
              <span>{view.rejectVotes}</span>
            </span>
            {view.removeVotes > 0 || view.currentVote === 'Remove' ? (
              <span
                className={`is-remove${
                  view.currentVote === 'Remove' ? ' is-confirmed' : ''
                }`}
              >
                <UserMinusIcon
                  className="protocol-card-vote-icon"
                  aria-hidden
                />
                <span>{view.removeVotes}</span>
              </span>
            ) : null}
            {progress.threshold != null && progress.totalWeight != null ? (
              <span className="protocol-card-vote-rule">
                {progress.threshold}/{progress.totalWeight} required
              </span>
            ) : null}
          </div>
          {total > 0 ? (
            <div className="protocol-card-vote-bar" aria-hidden>
              <span
                className="is-approve"
                style={{ width: `${approvePct}%` }}
              />
              <span className="is-reject" style={{ width: `${rejectPct}%` }} />
              <span className="is-remove" style={{ width: `${removePct}%` }} />
              <span
                className="is-pending"
                style={{ width: `${pendingPct}%` }}
              />
              {thresholdPct != null &&
              thresholdPct > 0 &&
              thresholdPct < 100 ? (
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
              aria-haspopup="dialog"
              aria-expanded={votersOpen}
              onClick={() => setVotersOpen(true)}
            >
              Votes · {view.voteEntries.length}
              {view.eligibleVoters.length > 0
                ? `/${view.eligibleVoters.length}`
                : ''}
            </button>
          </div>
        ) : null}
      </OsProposalCardBody>

      {canAct || shareHref || hasOnChain ? (
        <OsProposalCardFooter className="protocol-card-footer">
          {shareHref ? (
            <button
              type="button"
              className="protocol-card-link"
              onClick={() => {
                if (onCopyLink) {
                  onCopyLink();
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                  return;
                }
                void navigator.clipboard?.writeText(
                  new URL(shareHref, window.location.origin).toString()
                );
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          ) : null}
          {hasOnChain ? (
            <button
              type="button"
              className="protocol-card-link"
              onClick={() => setOnChainOpen(true)}
            >
              On-chain
            </button>
          ) : null}
          {canAct ? (
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              borderless
              className={`${osProposalCardActionsClassName} protocol-card-footer-actions`}
            >
              <OsSheetAction
                type="button"
                variant="primary"
                onClick={onOpenActions}
              >
                {view.canFinalize ? view.finalizeLabel : 'Vote'}
              </OsSheetAction>
            </OsSheetActions>
          ) : null}
        </OsProposalCardFooter>
      ) : null}
      </OsProposalCard>
    <ProtocolOnChainSheet
      open={onChainOpen}
      onClose={() => setOnChainOpen(false)}
      application={application}
    />
    <ProtocolVotersSheet
      open={votersOpen}
      onClose={() => setVotersOpen(false)}
      proposalId={view.proposalId}
      headline={view.headline}
      voteEntries={view.voteEntries}
      abstainers={abstainers}
      profiles={profiles}
      daoPolicy={daoPolicy}
      showProtocolRoleMarks={showProtocolRoleMarks}
    />
    </>
  );
}
