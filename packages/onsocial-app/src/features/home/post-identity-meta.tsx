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
  /** When set, `@handle` links to the profile (defaults to authorHref). */
  handleHref?: string;
  /** When set, the relative time links to the post/thread page. */
  timeHref?: string;
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
  handleHref,
  timeHref,
  channel,
  className,
}: PostIdentityMetaProps) {
  const timestampIso =
    timestamp != null ? postTimestampIso(timestamp) : undefined;
  const showTime = timestamp != null && timestamp !== '';
  const profileHandleHref = handleHref ?? authorHref;

  const nameNode = authorHref ? (
    <Link href={authorHref} className="post-identity-name" scroll={false}>
      {name}
    </Link>
  ) : (
    <span className="post-identity-name">{name}</span>
  );

  const handleNode = profileHandleHref ? (
    <Link
      href={profileHandleHref}
      className="post-identity-handle"
      scroll={false}
    >
      @{accountId}
    </Link>
  ) : (
    <span className="post-identity-handle">@{accountId}</span>
  );

  const timeNode = showTime ? (
    timeHref ? (
      <Link
        href={timeHref}
        className="post-identity-time"
        title={formatPostTimestamp(timestamp)}
        scroll={false}
        {...(timestampIso ? { dateTime: timestampIso } : {})}
      >
        {formatRelativePostTimestamp(timestamp)}
      </Link>
    ) : (
      <time
        className="post-identity-time"
        title={formatPostTimestamp(timestamp)}
        {...(timestampIso ? { dateTime: timestampIso } : {})}
      >
        {formatRelativePostTimestamp(timestamp)}
      </time>
    )
  ) : null;

  return (
    <span
      className={`post-identity-meta${className ? ` ${className}` : ''}`}
    >
      {nameNode}
      <span className="post-identity-sep" aria-hidden>
        ·
      </span>
      {handleNode}
      {timeNode ? (
        <>
          <span className="post-identity-sep" aria-hidden>
            ·
          </span>
          {timeNode}
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
