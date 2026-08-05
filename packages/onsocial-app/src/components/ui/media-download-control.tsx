'use client';

import { useRef, useState } from 'react';
import { CheckIcon, DownloadIcon, SaveIcon } from '@onsocial/ui';
import {
  isDownloadAbort,
  type DownloadProgressHandler,
} from '@/lib/media-download';

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

export function MediaDownloadProgressRing({
  progress,
}: {
  progress: number | null;
}) {
  return (
    <svg
      className={`media-download-ring${
        progress == null ? ' is-indeterminate' : ''
      }`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        className="media-download-ring-track"
        cx="12"
        cy="12"
        r={RING_R}
        fill="none"
      />
      <circle
        className="media-download-ring-fill"
        cx="12"
        cy="12"
        r={RING_R}
        fill="none"
        strokeDasharray={
          progress == null
            ? `${RING_C * 0.28} ${RING_C}`
            : `${RING_C * progress} ${RING_C}`
        }
      />
    </svg>
  );
}

export function MediaDownloadControl({
  ariaLabel,
  disabled,
  className,
  cached,
  glyph = 'download',
  onDownload,
  onRemove,
  onBusyChange,
}: {
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  /** In-app offline copy is present — tap removes it. */
  cached?: boolean;
  /** Download = in-app offline. Save = export a file copy. */
  glyph?: 'download' | 'save';
  onDownload: (onProgress: DownloadProgressHandler) => Promise<void>;
  onRemove?: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const inFlightRef = useRef(false);

  const busy = phase === 'busy';
  const showCached = Boolean(cached) && phase === 'idle';
  const label = busy
    ? progress == null
      ? `${ariaLabel} — saving`
      : `${ariaLabel} — ${Math.round(progress * 100)}%`
    : phase === 'done' || showCached
      ? cached
        ? `Remove offline — ${ariaLabel}`
        : `${ariaLabel} — saved`
      : ariaLabel;

  return (
    <button
      type="button"
      className={`media-download-control${className ? ` ${className}` : ''}${
        busy ? ' is-busy' : ''
      }${phase === 'done' || showCached ? ' is-done' : ''}${
        showCached ? ' is-cached' : ''
      }`}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy || (phase === 'done' && !cached)}
      onClick={() => {
        if (disabled || busy || inFlightRef.current) return;
        if (showCached && onRemove) {
          inFlightRef.current = true;
          onBusyChange?.(true);
          void onRemove()
            .catch(() => undefined)
            .finally(() => {
              inFlightRef.current = false;
              onBusyChange?.(false);
            });
          return;
        }
        if (phase === 'done') return;
        inFlightRef.current = true;
        let started = false;
        const markProgress: DownloadProgressHandler = (ratio) => {
          if (!started) {
            started = true;
            setPhase('busy');
            onBusyChange?.(true);
          }
          setProgress(ratio);
        };
        void onDownload(markProgress)
          .then(() => {
            if (!started) return;
            setPhase('done');
            window.setTimeout(() => setPhase('idle'), 900);
          })
          .catch((error) => {
            if (isDownloadAbort(error) && !started) return;
            setPhase('idle');
          })
          .finally(() => {
            inFlightRef.current = false;
            if (started) onBusyChange?.(false);
            setProgress(null);
          });
      }}
    >
      {phase === 'busy' ? (
        <MediaDownloadProgressRing progress={progress} />
      ) : phase === 'done' || showCached ? (
        <CheckIcon className="media-download-glyph" aria-hidden />
      ) : glyph === 'save' ? (
        <SaveIcon className="media-download-glyph" aria-hidden />
      ) : (
        <DownloadIcon className="media-download-glyph" aria-hidden />
      )}
    </button>
  );
}
