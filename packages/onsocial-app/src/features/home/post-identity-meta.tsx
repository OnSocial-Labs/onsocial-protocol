'use client';

import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { MessageFillIcon } from '@onsocial/ui';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  postTimestampIso,
} from '@/lib/post-display';

interface PostIdentityMetaProps {
  name: string;
  accountId: string;
  timestamp?: number | string;
  /** Face beside the name. When `authorHref` is set, it joins that one profile link. */
  avatar?: ReactNode;
  authorHref?: string;
  handleHref?: string;
  timeHref?: string;
  onTimeClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onTimeNavigate?: (event: { preventDefault(): void }) => void;
  /** Room label under the identity (guild “All” / mixed feeds / thread). */
  channel?: string;
  /** Trailing ··· — end of the name row. */
  trailing?: ReactNode;
  className?: string;
  /**
   * `inline` (feed): Name marks @handle · time
   * `stacked` (open post): standing-style cluster — avatar + name marks +
   * @handle in one hover hit; ⋮ stays on the name row.
   */
  layout?: 'inline' | 'stacked';
}

/** Post author identity — feed inline, or stacked for the open post root. */
export function PostIdentityMeta({
  name,
  accountId,
  timestamp,
  avatar,
  authorHref,
  handleHref,
  timeHref,
  onTimeClick,
  onTimeNavigate,
  channel,
  trailing,
  className,
  layout = 'inline',
}: PostIdentityMetaProps) {
  const timestampIso =
    timestamp != null ? postTimestampIso(timestamp) : undefined;
  const showTime = layout === 'inline' && timestamp != null && timestamp !== '';
  const profileHandleHref = handleHref ?? authorHref;
  const roomLabel = channel?.trim().replace(/^#/, '') || null;
  const stacked = layout === 'stacked';
  const sharedProfileHref =
    authorHref && profileHandleHref === authorHref ? authorHref : null;

  const nameNode = sharedProfileHref ? (
    <span className="post-identity-name" title={name}>
      {name}
    </span>
  ) : authorHref ? (
    <Link
      href={authorHref}
      className="post-identity-name"
      title={name}
      scroll={false}
    >
      {name}
    </Link>
  ) : (
    <span className="post-identity-name" title={name}>
      {name}
    </span>
  );

  // Same as standing-row-name-row: name + trailing marks, marks hug the name.
  const nameAndMarks = (
    <span className="post-identity-name-cluster">
      <span className="post-identity-name-wrap">{nameNode}</span>
      <ProtocolNameTrailing accountId={accountId} />
    </span>
  );

  const handleLabel = `@${accountId}`;
  const handleNode =
    profileHandleHref && !sharedProfileHref ? (
      <Link
        href={profileHandleHref}
        className="post-identity-handle"
        title={handleLabel}
        scroll={false}
      >
        {handleLabel}
      </Link>
    ) : (
      <span className="post-identity-handle" title={handleLabel}>
        {handleLabel}
      </span>
    );

  const timeNode = showTime ? (
    timeHref ? (
      <Link
        href={timeHref}
        className="post-identity-time"
        title={formatPostTimestamp(timestamp)}
        scroll={false}
        onClick={onTimeClick}
        onNavigate={onTimeNavigate}
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

  const timeWithSep = timeNode ? (
    <>
      <span className="post-identity-sep" aria-hidden>
        ·
      </span>
      {timeNode}
    </>
  ) : null;

  const channelNode = roomLabel ? (
    <span className="post-identity-channel">
      <MessageFillIcon className="post-identity-channel-icon" aria-hidden />
      <span className="post-identity-channel-label">{roomLabel}</span>
    </span>
  ) : null;

  if (stacked) {
    // One profile hit like standing: avatar + name/marks + @id hover together.
    const stackedBody = (
      <span className="post-identity-stack">
        {nameAndMarks}
        {handleNode}
      </span>
    );
    const profile = sharedProfileHref ? (
      <Link
        href={sharedProfileHref}
        className="post-card-identity"
        scroll={false}
        aria-label={`View ${name}, ${handleLabel}`}
      >
        {avatar}
        {stackedBody}
      </Link>
    ) : (
      <div className="post-card-identity">
        {avatar}
        {stackedBody}
      </div>
    );

    return (
      <div
        className={`post-identity post-identity--stacked${
          className ? ` ${className}` : ''
        }`}
      >
        <div className="post-identity-row">
          {profile}
          {trailing ? (
            <span className="post-identity-spacer" aria-hidden />
          ) : null}
          {trailing}
        </div>
        {channelNode}
      </div>
    );
  }

  const inlineCluster = (
    <span className="post-identity-inline-cluster">
      {nameAndMarks}
      {handleNode}
      {sharedProfileHref ? null : timeWithSep}
    </span>
  );

  const profileCluster = sharedProfileHref ? (
    <Link
      href={sharedProfileHref}
      className="post-card-identity"
      scroll={false}
      aria-label={`View ${name}, ${handleLabel}`}
    >
      {avatar}
      {inlineCluster}
    </Link>
  ) : (
    <div className="post-identity-main">{inlineCluster}</div>
  );

  return (
    <div className={`post-identity${className ? ` ${className}` : ''}`}>
      <div className="post-identity-row">
        {profileCluster}
        {sharedProfileHref && timeWithSep ? (
          <span className="post-identity-time-slot">{timeWithSep}</span>
        ) : null}
        {trailing ? (
          <span className="post-identity-spacer" aria-hidden />
        ) : null}
        {trailing}
      </div>
      {channelNode}
    </div>
  );
}
