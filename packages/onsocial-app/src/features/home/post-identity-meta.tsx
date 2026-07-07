import Link from 'next/link';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';

interface PostIdentityMetaProps {
  name: string;
  accountId: string;
  timestamp?: number | string;
  /** When set, the display name links to the profile. */
  authorHref?: string;
  /** Channel context rendered as trailing `· #channel` (mixed feeds only). */
  channel?: string;
  className?: string;
}

/** Name · @handle · time · #channel — shared post identity line across feed, quotes, composer. */
export function PostIdentityMeta({
  name,
  accountId,
  timestamp,
  authorHref,
  channel,
  className,
}: PostIdentityMetaProps) {
  const timestampIso =
    timestamp != null ? postTimestampIso(timestamp) : undefined;
  const showTime = timestamp != null && timestamp !== '';

  const nameNode = authorHref ? (
    <Link href={authorHref} className="post-identity-name">
      {name}
    </Link>
  ) : (
    <span className="post-identity-name">{name}</span>
  );

  return (
    <span
      className={`post-identity-meta${className ? ` ${className}` : ''}`}
    >
      {nameNode}
      <span className="post-identity-sep" aria-hidden>
        ·
      </span>
      <span className="post-identity-handle">@{accountId}</span>
      {showTime ? (
        <>
          <span className="post-identity-sep" aria-hidden>
            ·
          </span>
          <time
            className="post-identity-time"
            title={formatPostTimestamp(timestamp)}
            {...(timestampIso ? { dateTime: timestampIso } : {})}
          >
            {formatRelativePostTimestamp(timestamp)}
          </time>
        </>
      ) : null}
      {channel ? (
        <>
          <span className="post-identity-sep" aria-hidden>
            ·
          </span>
          <span className="post-identity-channel">#{channel}</span>
        </>
      ) : null}
    </span>
  );
}
