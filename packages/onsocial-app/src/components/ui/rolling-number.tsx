'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ROLLING_DIGIT_MS,
  mod10,
  nextDigitPosition,
  parkedDigitPosition,
  rollingGlyphs,
  rollingMotion,
} from '@/components/ui/rolling-digits';

const STRIP_LENGTH = 30;

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  );
}

function DigitRoll({
  digit,
  rollSignal,
  playFrom,
  stepPx,
}: {
  digit: number;
  rollSignal?: number;
  /** Mount already on this digit and roll to `digit`. */
  playFrom?: number;
  /** Fixed line height so the roll cannot change the count's box. */
  stepPx?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const target = mod10(digit);
  const [pos, setPos] = useState(() =>
    parkedDigitPosition(playFrom === undefined ? target : mod10(playFrom))
  );
  const [motion, setMotion] = useState(false);
  const posRef = useRef(pos);
  const skipRef = useRef(playFrom === undefined);
  const playedRef = useRef(false);
  const signalRef = useRef(rollSignal);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      signalRef.current = rollSignal;
      return;
    }

    const motionKind = rollingMotion(rollSignal, signalRef.current);
    const from = posRef.current;
    let cancelled = false;
    let timer = 0;
    let follow = 0;

    const park = (parked: number) => {
      if (cancelled) return;
      posRef.current = parked;
      setMotion(false);
      setPos(parked);
    };

    const mountPlay =
      playFrom !== undefined &&
      !playedRef.current &&
      mod10(playFrom) !== target;

    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      playedRef.current = true;
      signalRef.current = rollSignal;
      if (
        !mountPlay &&
        (reduced || motionKind === 'snap' || mod10(from) === target)
      ) {
        const parked = parkedDigitPosition(target);
        if (posRef.current !== parked) park(parked);
        else setMotion(false);
        return;
      }

      const parkedFrom = parkedDigitPosition(mod10(from));
      const destination = nextDigitPosition(from, target);
      const roll = () => {
        if (cancelled) return;
        posRef.current = destination;
        setMotion(true);
        setPos(destination);
        timer = window.setTimeout(() => {
          if (cancelled || posRef.current !== destination) return;
          park(parkedDigitPosition(target));
        }, ROLLING_DIGIT_MS + 40);
      };

      // Sit on the stored destination, then turn toward the newer digit.
      if (from !== parkedFrom) {
        park(parkedFrom);
        follow = window.requestAnimationFrame(roll);
        return;
      }
      roll();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(follow);
      window.clearTimeout(timer);
    };
  }, [playFrom, reduced, rollSignal, target]);

  const step = stepPx && stepPx > 0 ? stepPx : null;
  return (
    <span
      className="os-rolling-digit"
      style={step ? { height: step } : undefined}
    >
      <span
        className={
          motion
            ? 'os-rolling-digit-strip is-rolling'
            : 'os-rolling-digit-strip'
        }
        style={{
          transform: step
            ? `translate3d(0, ${-pos * step}px, 0)`
            : `translate3d(0, ${-pos}em, 0)`,
        }}
      >
        {Array.from({ length: STRIP_LENGTH }, (_, index) => (
          <span
            className="os-rolling-digit-cell"
            key={index}
            style={
              step
                ? {
                    height: step,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }
                : undefined
            }
          >
            {index % 10}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Integer wheel. First paint is still. Later changes roll each digit the short way.
 * Pass `rollSignal` to roll only when the viewer's own confirm bumps it.
 * Omit it to roll on every value change (the open drop supply).
 * `textRest` keeps each face digit in one fixed column. The column does not
 * change width when the digit changes, and the glyph is never squeezed.
 */
export function RollingNumber({
  value,
  rollSignal,
  grouped = false,
  textRest = false,
}: {
  value: number;
  rollSignal?: number;
  grouped?: boolean;
  /** Face count: stable digit columns, parked and while rolling. */
  textRest?: boolean;
}) {
  const glyphs = rollingGlyphs(value, grouped);
  return (
    <span
      className={
        textRest ? 'os-rolling-number is-face' : 'os-rolling-number'
      }
      aria-hidden="true"
    >
      {glyphs.map((glyph) =>
        glyph.kind === 'sep' ? (
          <span className="os-rolling-sep" key={glyph.key}>
            ,
          </span>
        ) : (
          <DigitRoll
            key={glyph.key}
            digit={glyph.digit}
            rollSignal={rollSignal}
          />
        )
      )}
    </span>
  );
}
