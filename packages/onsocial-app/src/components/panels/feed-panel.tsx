import type { PostRow } from '@onsocial/sdk';
import {
  formatRelativePostTimestamp,
  parsePostText,
  postTimestampIso,
} from '@/lib/post-display';

interface FeedPanelProps {
  accountId: string;
  posts?: PostRow[];
  postCount?: number;
}

export function FeedPanel({
  accountId,
  posts = [],
  postCount = 0,
}: FeedPanelProps) {
  const total = Math.max(postCount, posts.length);

  if (posts.length === 0) {
    return (
      <div className="panel-body">
        <p className="panel-lead">
          Public posts from <strong>@{accountId}</strong>.
        </p>
        <div className="panel-placeholder">
          <span className="panel-placeholder-label">
            {total > 0 ? `${total} indexed` : 'No posts yet'}
          </span>
          <p>
            {total > 0
              ? 'Indexed posts could not be loaded right now.'
              : 'Nothing published yet.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <p className="panel-lead">
        Public posts from <strong>@{accountId}</strong>
        {total > posts.length ? ` · showing ${posts.length}` : null}.
      </p>
      <ul className="feed-panel-list">
        {posts.map((post) => {
          const text = parsePostText(post.value).trim() || '…';
          const relative = formatRelativePostTimestamp(post.blockTimestamp);
          const iso = postTimestampIso(post.blockTimestamp);
          const kind =
            post.kind && post.kind !== 'text' ? post.kind : null;
          return (
            <li
              key={`${post.accountId}:${post.postId}`}
              className="feed-panel-item"
            >
              <p className="feed-panel-text">{text}</p>
              <div className="feed-panel-meta">
                {kind ? <span className="feed-panel-kind">{kind}</span> : null}
                <time dateTime={iso} title={iso}>
                  {relative}
                </time>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
