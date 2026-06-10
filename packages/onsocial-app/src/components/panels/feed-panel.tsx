interface FeedPanelProps {
  accountId: string;
  postCount?: number;
}

export function FeedPanel({ accountId, postCount = 0 }: FeedPanelProps) {
  return (
    <div className="panel-body">
      <p className="panel-lead">
        Public posts from <strong>@{accountId}</strong>.
      </p>
      <div className="panel-placeholder">
        <span className="panel-placeholder-label">
          {postCount > 0 ? `${postCount} indexed` : 'No posts yet'}
        </span>
        <p>The feed overlay will stream indexed posts for this account.</p>
      </div>
    </div>
  );
}
