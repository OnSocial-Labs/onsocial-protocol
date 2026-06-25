import type { ProfileReputation } from '@/lib/profile-signals';

interface ReputationPanelProps {
  accountId: string;
  reputation: ProfileReputation | null;
}

interface ScoreRow {
  label: string;
  value: number;
}

function formatScore(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function ReputationPanel({ accountId, reputation }: ReputationPanelProps) {
  if (!reputation) {
    return (
      <div className="panel-body">
        <p className="panel-lead">
          No protocol reputation indexed for <strong>@{accountId}</strong> yet.
        </p>
        <div className="panel-placeholder">
          <span className="panel-placeholder-label">Reputation v1</span>
          <p>
            Reputation accrues from standing, endorsements, posting, and
            consistency once this account is active on the protocol.
          </p>
        </div>
      </div>
    );
  }

  const scores: ScoreRow[] = [
    { label: 'Social', value: reputation.socialScore },
    { label: 'Commitment', value: reputation.commitmentScore },
    { label: 'Quality', value: reputation.qualityScore },
    { label: 'Consistency', value: reputation.consistencyScore },
  ];

  return (
    <div className="panel-body">
      <div className="reputation-headline">
        <span className="reputation-score">
          {formatScore(reputation.reputation)}
        </span>
        <span className="reputation-score-label">
          Reputation
          {reputation.rank > 0 ? ` · rank #${reputation.rank}` : ''}
        </span>
      </div>

      <ul className="reputation-scores">
        {scores.map((row) => (
          <li key={row.label} className="reputation-score-row">
            <span className="reputation-score-name">{row.label}</span>
            <span className="reputation-score-bar" aria-hidden>
              <span
                className="reputation-score-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, row.value))}%`,
                }}
              />
            </span>
            <span className="reputation-score-value">
              {formatScore(row.value)}
            </span>
          </li>
        ))}
      </ul>

      <p className="reputation-meta">
        Confidence {Math.round(reputation.confidenceScore * 100)}% ·{' '}
        {reputation.totalPosts} posts
      </p>
    </div>
  );
}
