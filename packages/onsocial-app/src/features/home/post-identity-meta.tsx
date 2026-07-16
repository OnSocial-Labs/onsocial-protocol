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
  /** Room label under the identity (guild “All” / mixed feeds / thread). */
  channel?: string;
  /** Trailing ··· — end of the name row. */
  trailing?: ReactNode;
  className?: string;
  /**
   * `inline` (feed): Name @handle · time
   * `stacked` (open post): Name, then @handle below — time rendered under the body.
   */
  layout?: 'inline' | 'stacked';
}

/** Post author identity — feed inline, or stacked for the open post root. */
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
  layout = 'inline',
}: PostIdentityMetaProps) {
  const timestampIso =
    timestamp != null ? postTimestampIso(timestamp) : undefined;
  const showTime =
    layout === 'inline' && timestamp != null && timestamp !== '';
  const profileHandleHref = handleHref ?? authorHref;
  const roomLabel = channel?.trim().replace(/^#/, '') || null;
  const stacked = layout === 'stacked';

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
    <div
      className={`post-identity${stacked ? ' post-identity--stacked' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div className="post-identity-row">
        <div
          className={
            stacked
              ? 'post-identity-main post-identity-main--stacked'
              : 'post-identity-main'
          }
        >
          {nameNode}
          {handleNode}
          {timeNode ? (
            <>
              <span className="post-identity-sep" aria-hidden>
                ·
              </span>
              {timeNode}
            </>
          ) : null}
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
