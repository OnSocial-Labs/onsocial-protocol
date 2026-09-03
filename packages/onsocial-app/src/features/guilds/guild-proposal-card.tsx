'use client';

import Link from 'next/link';
import type { Proposal, ProposalTally } from '@onsocial/sdk';
import {
  OsProposalCard,
  OsProposalCardBody,
  OsProposalCardFooter,
  OsProposalCardSep,
  OsProposalCardStrip,
  OsProposalCardStripMain,
  OsSheetAction,
  OsSheetActions,
  osProposalCardActionsClassName,
  osSheetActionExpandedClassName,
  osSheetFloatingPanelCopyClassName,
  osSheetFloatingPanelMetaClassName,
} from '@onsocial/ui';
import {
  guildProposalOutcome,
  guildProposalPresentation,
  guildProposalTallyLabel,
  guildProposalVoteProgress,
  guildViewerVoteLabel,
} from '@/features/guilds/guild-proposal-display';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  resolvePostDate,
} from '@/lib/post-display';
import { displayName } from '@/lib/profile-display';

export interface GuildProposalCardProps {
  proposal: Proposal;
  tally: ProposalTally | null;
  viewerVote?: boolean;
  canVote?: boolean;
  pendingAction?: 'support' | 'oppose' | 'cancel' | null;
  isOwnRequest?: boolean;
  suppressProposer?: boolean;
  showSequence?: boolean;
  supportLabel?: string;
  opposeLabel?: string;
  profiles: Record<
    string,
    { displayName?: string | null; avatarUrl?: string | null } | undefined
  >;
  onSupport?: () => void;
  onOppose?: () => void;
  onCancel?: () => void;
}

export function GuildProposalCard({
  proposal,
  tally,
  viewerVote,
  canVote = false,
  pendingAction = null,
  isOwnRequest = false,
  suppressProposer = false,
  showSequence = true,
  supportLabel = 'Support',
  opposeLabel = 'Oppose',
  profiles,
  onSupport,
  onOppose,
  onCancel,
}: GuildProposalCardProps) {
  const presentation = guildProposalPresentation(proposal);
  const outcome = guildProposalOutcome(proposal, presentation);
  const tallyLabel = outcome.isTerminal ? null : guildProposalTallyLabel(tally);
  const voteProgress = guildProposalVoteProgress(proposal, tally);
  // Prefer progress line over strip tally — avoid duplicate vote copy.
  const stripStatusLabel =
    outcome.stripLabel ??
    (voteProgress.showProgress ? null : tallyLabel);
  const targetAccountId = presentation.targetAccountId;
  const targetProfile = targetAccountId ? profiles[targetAccountId] : undefined;
  const targetDisplayName = targetAccountId
    ? displayName(targetAccountId, targetProfile?.displayName ?? undefined)
    : null;
  const showIdentity = Boolean(targetAccountId && targetDisplayName);
  const bodyLine = showIdentity
    ? presentation.detail ??
      (presentation.roleLabel
        ? presentation.roleLabel === 'Member'
          ? 'Make regular member'
          : `Promote to ${presentation.roleLabel.toLowerCase()}`
        : presentation.headline)
    : null;
  const showHandle =
    showIdentity &&
    presentation.targetLabel &&
    presentation.targetLabel.toLowerCase() !== targetDisplayName?.toLowerCase();
  const proposerAccountId = proposal.proposer?.trim() || null;
  const proposerProfile = proposerAccountId
    ? profiles[proposerAccountId]
    : undefined;
  const proposerDisplayName = proposerAccountId
    ? displayName(proposerAccountId, proposerProfile?.displayName ?? undefined)
    : null;
  const submittedDate = resolvePostDate(proposal.created_at);
  const submittedRelative = formatRelativePostTimestamp(proposal.created_at);
  const submittedTitle = formatPostTimestamp(proposal.created_at);
  const showProposer =
    !suppressProposer && Boolean(proposerAccountId && proposerDisplayName);
  const showFooter =
    outcome.isTerminal ||
    voteProgress.showProgress ||
    viewerVote === true ||
    viewerVote === false ||
    canVote ||
    (isOwnRequest && onCancel);

  return (
    <OsProposalCard
      surface="bordered"
      className={`guild-proposal-card guild-proposal-card--${presentation.kindTone}${
        outcome.isTerminal ? ` guild-proposal-card--${outcome.tone}` : ''
      }`}
    >
      <OsProposalCardStrip className="guild-proposal-card-strip">
        <OsProposalCardStripMain>
          {showSequence && proposal.sequence_number > 0 ? (
            <>
              <span className="guild-proposal-card-seq">
                #{proposal.sequence_number}
              </span>
              <OsProposalCardSep />
            </>
          ) : null}
          <span className="guild-proposal-card-kind">{presentation.kind}</span>
          {submittedRelative ? (
            <>
              <OsProposalCardSep />
              <time
                className="guild-proposal-card-time"
                dateTime={submittedDate?.toISOString()}
                title={submittedTitle}
              >
                {submittedRelative}
              </time>
            </>
          ) : null}
          {!outcome.isTerminal && voteProgress.closesLabel ? (
            <>
              <OsProposalCardSep />
              <span
                className="guild-proposal-card-closes"
                title={voteProgress.closesTitle ?? undefined}
              >
                {voteProgress.closesLabel}
              </span>
            </>
          ) : null}
        </OsProposalCardStripMain>
        {stripStatusLabel ? (
          <span
            className={`guild-proposal-card-tally${
              outcome.stripLabel
                ? ` guild-proposal-card-status guild-proposal-card-status--${outcome.tone}`
                : ''
            }`}
          >
            {stripStatusLabel}
          </span>
        ) : null}
      </OsProposalCardStrip>

      <OsProposalCardBody className="guild-proposal-card-body">
        <div className="guild-proposal-card-main">
          {showIdentity ? (
            <Link
              href={portfolioPath(targetAccountId!)}
              className="guild-proposal-card-avatar-link"
              scroll={false}
            >
              <AccountAvatar
                accountId={targetAccountId}
                kind={targetProfile?.kind}
                src={targetProfile?.avatarUrl ?? null}
                fallbackInitial={targetDisplayName!}
                shellLoading={!targetProfile}
                size="sm"
                className="guild-proposal-card-avatar"
              />
            </Link>
          ) : null}

          <div className="guild-proposal-card-copy">
            {showIdentity ? (
              <div className="guild-proposal-card-identity-row">
                <Link
                  href={portfolioPath(targetAccountId!)}
                  className="guild-proposal-card-name"
                  scroll={false}
                >
                  {targetDisplayName}
                </Link>
                {presentation.roleLabel ? (
                  <span className="guild-proposal-card-role-pill">
                    {presentation.roleLabel}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="guild-proposal-card-headline">
                {presentation.headline}
              </p>
            )}

            {showIdentity && bodyLine ? (
              <p className="guild-proposal-card-action">{bodyLine}</p>
            ) : null}

            {showHandle ? (
              <Link
                href={portfolioPath(targetAccountId!)}
                className="guild-proposal-card-handle"
                scroll={false}
              >
                @{presentation.targetLabel}
              </Link>
            ) : null}
          </div>
        </div>

        {showProposer ? (
          <Link
            href={portfolioPath(proposerAccountId!)}
            className="guild-proposal-card-proposer"
            scroll={false}
          >
            <AccountAvatar
              accountId={proposerAccountId}
              kind={proposerProfile?.kind}
              src={proposerProfile?.avatarUrl ?? null}
              fallbackInitial={proposerDisplayName!}
              shellLoading={!proposerProfile}
              size="sm"
              className="guild-proposal-card-proposer-avatar"
            />
            <span className="guild-proposal-card-proposer-by">by</span>
            <span className="guild-proposal-card-proposer-name">
              {proposerDisplayName}
            </span>
          </Link>
        ) : null}
      </OsProposalCardBody>

      {showFooter ? (
        <OsProposalCardFooter className="guild-proposal-card-footer">
          {voteProgress.showProgress ? (
            <div className="guild-proposal-card-progress">
              <div
                className="guild-proposal-card-progress-track"
                role="img"
                aria-label={voteProgress.ariaLabel}
              >
                <span
                  className="guild-proposal-card-progress-support"
                  style={{ width: `${voteProgress.supportPoolPercent}%` }}
                />
                <span
                  className="guild-proposal-card-progress-oppose"
                  style={{ width: `${voteProgress.opposePoolPercent}%` }}
                />
                {voteProgress.quorumVotesRequired > 0 &&
                voteProgress.quorumMarkerPercent < 100 ? (
                  <span
                    className="guild-proposal-card-progress-quorum"
                    style={{ left: `${voteProgress.quorumMarkerPercent}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {outcome.isTerminal ? (
            <p className={osSheetFloatingPanelCopyClassName}>
              {outcome.tone === 'approved' && presentation.roleLabel ? (
                <>
                  <strong>{presentation.roleLabel}</strong> role applied.
                </>
              ) : (
                outcome.footerLabel
              )}
            </p>
          ) : isOwnRequest && onCancel ? (
            <>
              <p className={osSheetFloatingPanelCopyClassName}>
                Request pending
                <span className={osSheetFloatingPanelMetaClassName}>
                  {' '}
                  · waiting for members to vote
                </span>
              </p>
              {pendingAction === 'cancel' ? (
                <p className={osSheetFloatingPanelMetaClassName}>Canceling…</p>
              ) : null}
              <OsSheetActions
                layout="row-compact"
                tone="frosted-primary"
                borderless
                className={osProposalCardActionsClassName}
              >
                <OsSheetAction
                  type="button"
                  variant="danger"
                  disabled={pendingAction === 'cancel'}
                  onClick={onCancel}
                >
                  Cancel request
                </OsSheetAction>
              </OsSheetActions>
            </>
          ) : (
            <div className="guild-proposal-card-vote-row">
              {voteProgress.showProgress && voteProgress.label ? (
                <p className="guild-proposal-card-progress-label">
                  {voteProgress.label}
                </p>
              ) : viewerVote === true || viewerVote === false ? (
                <p className="guild-proposal-card-voted">
                  {guildViewerVoteLabel(viewerVote)}
                </p>
              ) : (
                <span className="guild-proposal-card-vote-spacer" />
              )}

              {viewerVote === true || viewerVote === false ? null : canVote ? (
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  borderless
                  className={osProposalCardActionsClassName}
                >
                  {!pendingAction ? (
                    <>
                      <OsSheetAction
                        type="button"
                        variant="danger"
                        onClick={onOppose}
                      >
                        {opposeLabel}
                      </OsSheetAction>
                      <OsSheetAction
                        type="button"
                        variant="primary"
                        ready
                        onClick={onSupport}
                      >
                        {supportLabel}
                      </OsSheetAction>
                    </>
                  ) : pendingAction === 'support' ? (
                    <OsSheetAction
                      type="button"
                      variant="primary"
                      ready
                      pending
                      pendingLabel="Voting…"
                      disabled
                      className={osSheetActionExpandedClassName}
                      onClick={onSupport}
                    >
                      {supportLabel}
                    </OsSheetAction>
                  ) : (
                    <OsSheetAction
                      type="button"
                      variant="danger"
                      pending
                      pendingLabel="Voting…"
                      disabled
                      className={osSheetActionExpandedClassName}
                      onClick={onOppose}
                    >
                      {opposeLabel}
                    </OsSheetAction>
                  )}
                </OsSheetActions>
              ) : null}
            </div>
          )}
        </OsProposalCardFooter>
      ) : null}
    </OsProposalCard>
  );
}
