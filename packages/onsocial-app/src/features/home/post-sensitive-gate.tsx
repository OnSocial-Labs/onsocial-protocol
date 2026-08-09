'use client';

import { useState, type ReactNode } from 'react';
import {
  postHasContentLabels,
  sensitiveGateLabel,
  type PostContentLabels,
} from '@/lib/post-content-labels';

/**
 * When Safe mode is on:
 * - spoilers (`contentWarning` only) hide behind Show
 * - NSFW blurs in place until Show
 * When Safe mode is off (or after reveal), label chips sit above the content.
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
  /** Quote insets / reply targets — shorter chrome. */
  compact?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const hasLabels = postHasContentLabels(labels);
  const gated = safeMode && hasLabels && !revealed;
  const useBlur = Boolean(labels.nsfw);

  if (!hasLabels) {
    return <>{children}</>;
  }

  const reveal = (event: {
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    event.preventDefault();
    event.stopPropagation();
    setRevealed(true);
  };

  if (gated && useBlur) {
    return (
      <div
        className={`post-sensitive-blur${compact ? ' is-compact' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="post-sensitive-blur-content" aria-hidden>
          {children}
        </div>
        <div className="post-sensitive-blur-overlay">
          <p className="post-sensitive-gate-label">{sensitiveGateLabel(labels)}</p>
          <button
            type="button"
            className="post-sensitive-gate-reveal"
            onClick={reveal}
          >
            Show
          </button>
        </div>
      </div>
    );
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
          onClick={reveal}
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
