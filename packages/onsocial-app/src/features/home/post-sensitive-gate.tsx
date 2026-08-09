'use client';

import { useState, type ReactNode } from 'react';
import {
  postHasContentLabels,
  sensitiveGateLabel,
  type PostContentLabels,
} from '@/lib/post-content-labels';

/**
 * When Safe mode is on, hide NSFW / content-warning bodies behind a reveal.
 * When Safe mode is off, show optional label chips above the content.
 */
export function PostSensitiveGate({
  labels,
  safeMode,
  children,
  compact = false,
}: {
  labels: PostContentLabels;
  safeMode: boolean;
  children: ReactNode;
  /** Quote insets — shorter chrome. */
  compact?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasLabels = postHasContentLabels(labels);
  const gated = safeMode && hasLabels && !revealed;

  if (!hasLabels) {
    return <>{children}</>;
  }

  if (gated) {
    return (
      <div
        className={`post-sensitive-gate${compact ? ' is-compact' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="post-sensitive-gate-label">{sensitiveGateLabel(labels)}</p>
        <button
          type="button"
          className="post-sensitive-gate-reveal"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setRevealed(true);
          }}
        >
          Show
        </button>
      </div>
    );
  }

  return (
    <div className="post-sensitive-content">
      <div className="post-sensitive-badges" aria-label="Content labels">
        {labels.nsfw ? <span className="post-sensitive-badge">NSFW</span> : null}
        {labels.contentWarning ? (
          <span className="post-sensitive-badge">{labels.contentWarning}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
