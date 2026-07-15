import type { ReactNode } from 'react';
import Link from 'next/link';
import { MessageFillIcon } from '@onsocial/ui';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';

interface PostIdentityMetaProps {
  name: string;
  accountId: string;
  timestamp?: number | string;
  authorHref?: string;
  handleHref?: string;
  timeHref?: string;
  /** Room label under the identity line (guild “All” / mixed feeds). */
  channel?: string;
  /** Trailing ··· — card’s right edge, opposite time. */
  trailing?: ReactNode;
  className?: string;
}

/** `Name @handle · time` on one line; optional room row under. */
export function PostIdentityMeta({
  name,
  accountId,
  timestamp,
  authorHref,
  handleHref,
  timeHref,
  channel,
  trailing,
  className,
}: PostIdentityMetaProps) {
  const timestampIso =
    timestamp != null ? postTimestampIso(timestamp) : undefined;
  const showTime = timestamp != null && timestamp !== '';
  const profileHandleHref = handleHref ?? authorHref;
  const roomLabel = channel?.trim().replace(/^#/, '') || null;

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
    <div className={`post-identity${className ? ` ${className}` : ''}`}>
      <div className="post-identity-row">
        <div className="post-identity-meta">
          {nameNode}
          <span className="post-identity-tail">
            {handleNode}
            {timeNode ? (
              <>
                <span className="post-identity-sep" aria-hidden>
                  ·
                </span>
                {timeNode}
              </>
            ) : null}
          </span>
        </div>
        {trailing}
      </div>
      {roomLabel ? (
        <span className="post-identity-channel">
          <MessageFillIcon
            className="post-identity-channel-icon"
            aria-hidden
          />
          <span className="post-identity-channel-label">{roomLabel}</span>
        </span>
      ) : null}
    </div>
  );
}
