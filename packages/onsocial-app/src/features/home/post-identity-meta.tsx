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
    <span className="post-identity-name">{name}</span>
  ) : authorHref ? (
    <Link href={authorHref} className="post-identity-name" scroll={false}>
      {name}
    </Link>
  ) : (
    <span className="post-identity-name">{name}</span>
  );

  const marksNode = (
    <span className="post-identity-name-marks">
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

  const inlineNames = (
    <span className="post-identity-inline-cluster">
      {nameNode}
      {marksNode}
      {handleNode}
      {sharedProfileHref ? null : timeWithSep}
    </span>
  );

  const stackedNames = (
    <span className="post-identity-main post-identity-main--stacked">
      <span className="post-identity-name-cluster">
        {nameNode}
        {marksNode}
      </span>
      {handleNode}
    </span>
  );

  const names = stacked ? stackedNames : inlineNames;
  const profileCluster = sharedProfileHref ? (
    <Link
      href={sharedProfileHref}
      className="post-card-identity"
      scroll={false}
      aria-label={`View ${name}'s profile`}
    >
      {avatar}
      {names}
    </Link>
  ) : stacked ? (
    names
  ) : (
    <div className="post-identity-main">{names}</div>
  );

  return (
    <div
      className={`post-identity${stacked ? ' post-identity--stacked' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <div className="post-identity-row">
        {profileCluster}
        {sharedProfileHref && timeWithSep ? (
          <span className="post-identity-time-slot">{timeWithSep}</span>
        ) : null}
        {sharedProfileHref ? (
          <span className="post-identity-spacer" aria-hidden />
        ) : null}
        {trailing}
      </div>
      {roomLabel ? (
        <span className="post-identity-channel">
          <MessageFillIcon className="post-identity-channel-icon" aria-hidden />
          <span className="post-identity-channel-label">{roomLabel}</span>
        </span>
      ) : null}
    </div>
  );
}
