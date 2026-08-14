'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { cn } from './cn.js';

const HOLD_DELAY_MS = 380;
const HOLD_INTERVAL_SLOW_MS = 110;
const HOLD_INTERVAL_FAST_MS = 45;

export const collectionQtyClassName = 'collection-qty';

export interface CollectionQtyStepperProps {
  value: number;
  min?: number;
  max: number;
  disabled?: boolean;
  /** Shown after the typed value (e.g. `%`). */
  suffix?: string;
  className?: string;
  'aria-label'?: string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (next: number) => void;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Soft-egg − / value / + control. Hold −/+ to accelerate; tap the value to type.
 * Pair with `collection-qty.css`. Host overrides (e.g. royalty width) stay in app.
 */
export function CollectionQtyStepper({
  value,
  min = 1,
  max,
  disabled = false,
  suffix,
  className,
  'aria-label': ariaLabel = 'Quantity',
  decreaseLabel,
  increaseLabel,
  onChange,
}: CollectionQtyStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const holdRef = useRef<{
    delay?: number;
    interval?: number;
    pointerId?: number;
  }>({});
  const steppedFromPointerRef = useRef(false);
  const display = draft ?? String(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const clearHold = useCallback(() => {
    const hold = holdRef.current;
    if (hold.delay != null) window.clearTimeout(hold.delay);
    if (hold.interval != null) window.clearInterval(hold.interval);
    holdRef.current = {};
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const commit = useCallback(
    (next: number) => {
      const clamped = clampInt(next, min, max);
      if (clamped !== valueRef.current) onChangeRef.current(clamped);
      return clamped;
    },
    [max, min]
  );

  const stepBy = useCallback(
    (delta: number) => {
      if (disabled) return;
      commit(valueRef.current + delta);
    },
    [commit, disabled]
  );

  const startHold = useCallback(
    (delta: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      clearHold();
      steppedFromPointerRef.current = true;
      stepBy(delta);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      holdRef.current = {
        pointerId: event.pointerId,
        delay: window.setTimeout(() => {
          let ticks = 0;
          const run = () => {
            stepBy(delta);
            ticks += 1;
            if (ticks === 8 && holdRef.current.interval != null) {
              window.clearInterval(holdRef.current.interval);
              holdRef.current.interval = window.setInterval(
                () => stepBy(delta),
                HOLD_INTERVAL_FAST_MS
              );
            }
          };
          holdRef.current.interval = window.setInterval(
            run,
            HOLD_INTERVAL_SLOW_MS
          );
        }, HOLD_DELAY_MS),
      };
    },
    [clearHold, disabled, stepBy]
  );

  const stopHold = useCallback(
    (event?: ReactPointerEvent<HTMLButtonElement>) => {
      const pointerId = holdRef.current.pointerId;
      clearHold();
      if (event && pointerId != null) {
        try {
          if (event.currentTarget.hasPointerCapture(pointerId)) {
            event.currentTarget.releasePointerCapture(pointerId);
          }
        } catch {
          /* ignore */
        }
      }
    },
    [clearHold]
  );

  const handleClick =
    (delta: number) => (event: { preventDefault: () => void }) => {
      if (steppedFromPointerRef.current) {
        steppedFromPointerRef.current = false;
        event.preventDefault();
        return;
      }
      stepBy(delta);
    };

  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;
  const valueWidthCh = Math.max(String(max).length, String(min).length, 1);

  const flushDraft = () => {
    const raw = draft ?? String(valueRef.current);
    const parsed = Number.parseInt(raw.trim(), 10);
    setDraft(null);
    if (!Number.isSafeInteger(parsed)) return;
    commit(parsed);
  };

  return (
    <div
      className={cn(collectionQtyClassName, className)}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="collection-qty-btn"
        disabled={!canDecrease}
        aria-label={decreaseLabel}
        onPointerDown={(event) => startHold(-1, event)}
        onPointerUp={(event) => stopHold(event)}
        onPointerCancel={(event) => stopHold(event)}
        onLostPointerCapture={() => clearHold()}
        onContextMenu={(event) => event.preventDefault()}
        onClick={handleClick(-1)}
      >
        −
      </button>
      <span className="collection-qty-value-wrap">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="collection-qty-value"
          style={{ width: `${valueWidthCh}ch` }}
          value={display}
          disabled={disabled}
          aria-label={ariaLabel}
          onFocus={(event) => {
            setDraft(String(valueRef.current));
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setDraft(event.target.value.replace(/\D/g, ''));
          }}
          onBlur={() => {
            flushDraft();
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              flushDraft();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(null);
              event.currentTarget.blur();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setDraft(null);
              stepBy(1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setDraft(null);
              stepBy(-1);
            }
          }}
        />
        {suffix ? (
          <span className="collection-qty-suffix" aria-hidden>
            {suffix}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        className="collection-qty-btn"
        disabled={!canIncrease}
        aria-label={increaseLabel}
        onPointerDown={(event) => startHold(1, event)}
        onPointerUp={(event) => stopHold(event)}
        onPointerCancel={(event) => stopHold(event)}
        onLostPointerCapture={() => clearHold()}
        onContextMenu={(event) => event.preventDefault()}
        onClick={handleClick(1)}
      >
        +
      </button>
    </div>
  );
}
