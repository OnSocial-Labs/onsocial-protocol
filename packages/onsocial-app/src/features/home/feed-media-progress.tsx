'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The only media scrubber — video, feed audio, and the listen player.
 *
 * Thin rail, fill on the compositor, knob only while hovering or dragging.
 * A drag previews the rail. `currentTime` is committed on release so the
 * decoder does not rewind under the finger. Rail height stays fixed.
 */

export function paintClipProgress(
  rail: HTMLElement | null,
  scrub: HTMLInputElement | null,
  elapsed: HTMLElement | null,
  time: number,
  total: number,
  elapsedLabel: string,
  ariaText = elapsedLabel
): void {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const capped = safeTotal > 0 ? Math.min(safeTime, safeTotal) : safeTime;
  const p = safeTotal > 0 ? capped / safeTotal : 0;
  rail?.style.setProperty('--scarce-clip-p', p.toFixed(4));
  if (scrub) {
    scrub.value = String(capped);
    scrub.setAttribute('aria-valuetext', ariaText);
  }
  if (elapsed) elapsed.textContent = elapsedLabel;
}

function timeFromClientX(
  rail: HTMLDivElement | null,
  clientX: number,
  total: number
): number {
  if (!rail || !(total > 0)) return 0;
  const rect = rail.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * total;
}

export function ClipProgressTrack({
  railRef,
  scrubRef,
  duration,
  disabled = false,
  scrubbing = false,
  progressKey,
  ariaLabel = 'Seek',
  onScrubStart,
  onPreview,
  onCommit,
}: {
  railRef: RefObject<HTMLDivElement | null>;
  scrubRef: RefObject<HTMLInputElement | null>;
  /** Media duration in seconds. The range value is time, not a 0–1 step. */
  duration: number;
  disabled?: boolean;
  scrubbing?: boolean;
  progressKey?: string;
  ariaLabel?: string;
  /** Pause and mark the gesture. Do not seek. */
  onScrubStart?: () => void;
  /** Paint only. Do not set currentTime. */
  onPreview: (time: number) => void;
  /** Pointer up, cancel, or keyboard — the only seek. */
  onCommit: (time: number) => void;
}) {
  const [knobPeek, setKnobPeek] = useState(false);
  const peekTimerRef = useRef<number | null>(null);
  const wasScrubbingRef = useRef(false);
  const draggingRef = useRef(false);
  const suppressChangeRef = useRef(false);

  function clearPeek() {
    if (peekTimerRef.current != null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }

  function peek(holdMs: number) {
    clearPeek();
    setKnobPeek(true);
    peekTimerRef.current = window.setTimeout(() => {
      setKnobPeek(false);
      peekTimerRef.current = null;
    }, holdMs);
  }

  useEffect(() => {
    if (scrubbing) {
      clearPeek();
      setKnobPeek(true);
      wasScrubbingRef.current = true;
      return;
    }
    if (!wasScrubbingRef.current) return;
    wasScrubbingRef.current = false;
    peek(1400);
    // peek closes over the latest timer ref; scrubbing is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing]);

  useEffect(() => () => clearPeek(), []);

  const blocked = disabled || !(duration > 0);

  function timeAt(clientX: number): number {
    return timeFromClientX(railRef.current, clientX, duration);
  }

  return (
    <div
      className={`scarce-clip-progress-track${
        scrubbing ? ' is-scrubbing' : ''
      }${knobPeek ? ' is-knob-peek' : ''}${blocked ? ' is-disabled' : ''}`}
      onPointerEnter={() => {
        clearPeek();
        setKnobPeek(true);
      }}
      onPointerLeave={() => {
        if (!scrubbing && !draggingRef.current) peek(1100);
      }}
    >
      <div ref={railRef} className="scarce-clip-progress-rail" aria-hidden>
        <div className="scarce-clip-progress-fill" />
        <span className="scarce-clip-progress-knob" />
      </div>
      <input
        key={progressKey}
        ref={scrubRef}
        type="range"
        className="scarce-clip-progress-scrub"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.01}
        defaultValue={0}
        disabled={blocked}
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          if (blocked) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          onScrubStart?.();
          onPreview(timeAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          onPreview(timeAt(event.clientX));
        }}
        onPointerUp={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          suppressChangeRef.current = true;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onCommit(timeAt(event.clientX));
          window.setTimeout(() => {
            suppressChangeRef.current = false;
          }, 0);
        }}
        onPointerCancel={(event) => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          suppressChangeRef.current = true;
          onCommit(timeAt(event.clientX));
          window.setTimeout(() => {
            suppressChangeRef.current = false;
          }, 0);
        }}
        onChange={(event) => {
          if (draggingRef.current || suppressChangeRef.current) return;
          peek(1100);
          onCommit(Number(event.currentTarget.value));
        }}
      />
    </div>
  );
}
