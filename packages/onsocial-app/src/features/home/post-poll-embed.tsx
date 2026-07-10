'use client';

import { useState } from 'react';
import { PulsingDots } from '@onsocial/ui';
import type { PostPollEmbed } from '@/lib/post-display';
import { distributePollPercents, type PollTally } from '@/lib/poll-votes';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function pollStatusLabel(closesAt: number | undefined, now: number): string {
  if (closesAt == null) return 'Open';
  const remaining = closesAt - now;
  if (remaining <= 0) return 'Closed';
  if (remaining < MINUTE_MS) return 'Ends soon';
  if (remaining < HOUR_MS) {
    const minutes = Math.max(1, Math.round(remaining / MINUTE_MS));
    return `${minutes}m left`;
  }
  if (remaining < DAY_MS) {
    const hours = Math.max(1, Math.round(remaining / HOUR_MS));
    return `${hours}h left`;
  }
  const days = Math.ceil(remaining / DAY_MS);
  if (days < 14) return `${days}d left`;
  return `Ends ${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(closesAt))}`;
}

function voteCountLabel(total: number): string {
  if (total <= 0) return 'No votes yet';
  if (total === 1) return '1 vote';
  return `${total} votes`;
}

function PollCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="0.85rem"
      height="0.85rem"
      fill="none"
      aria-hidden
    >
      <path
        d="M3.5 8.2 6.4 11l6.1-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Poll block for feed cards. Results stay hidden until the viewer votes
 * (or the poll closes). One vote per viewer; changeable while open.
 */
export function PostPollEmbedCard({
  poll,
  tally,
  pending = false,
  onVote,
}: {
  poll: PostPollEmbed;
  tally?: PollTally;
  pending?: boolean;
  onVote?: (optionIndex: number) => void;
}) {
  const [now] = useState(() => Date.now());
  const closed = poll.closesAt != null && poll.closesAt <= now;
  const counts = tally?.counts ?? poll.options.map(() => 0);
  const total = tally?.total ?? 0;
  const viewerOptionIndex = tally?.viewerOptionIndex ?? null;
  // Best-in-class: don't leak others' tallies before you've voted.
  const showResults = closed || viewerOptionIndex != null;
  const canVote = Boolean(onVote) && !closed && !pending;
  const percents = showResults
    ? distributePollPercents(counts, total)
    : poll.options.map(() => 0);
  const winningCount =
    closed && total > 0 ? Math.max(...counts, 0) : null;

  return (
    <div className="post-poll-embed" aria-label="Poll">
      {poll.question ? (
        <p className="post-poll-question">{poll.question}</p>
      ) : null}
      <ul className="post-poll-options">
        {poll.options.map((option, index) => {
          const pct = percents[index] ?? 0;
          const selected = viewerOptionIndex === index;
          const isPendingChoice = pending && selected;
          const isWinner =
            winningCount != null &&
            (counts[index] ?? 0) === winningCount &&
            winningCount > 0;
          const className = [
            'post-poll-option',
            showResults ? 'has-results' : '',
            selected ? 'is-selected' : '',
            isPendingChoice ? 'is-pending' : '',
            isWinner ? 'is-winner' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={`${index}-${option}`}>
              <button
                type="button"
                className={className}
                disabled={!canVote}
                aria-pressed={selected}
                aria-label={
                  showResults
                    ? `${option}, ${pct}%${selected ? ', your vote' : ''}${
                        isWinner ? ', winning' : ''
                      }`
                    : `Vote for ${option}`
                }
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!canVote) return;
                  onVote?.(index);
                }}
              >
                {showResults ? (
                  <span
                    className="post-poll-option-fill"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                ) : null}
                <span className="post-poll-option-main">
                  {selected ? (
                    <span className="post-poll-option-check">
                      <PollCheckIcon />
                    </span>
                  ) : null}
                  <span className="post-poll-option-label">{option}</span>
                </span>
                {isPendingChoice ? (
                  <PulsingDots
                    size="sm"
                    className="post-poll-option-pending"
                    label="Confirming vote"
                  />
                ) : showResults ? (
                  <span className="post-poll-option-pct">{pct}%</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="post-poll-footer">
        {showResults ? voteCountLabel(total) : 'Vote to see results'}
        <span aria-hidden> · </span>
        {closed ? 'Closed' : pollStatusLabel(poll.closesAt, now)}
      </p>
    </div>
  );
}
