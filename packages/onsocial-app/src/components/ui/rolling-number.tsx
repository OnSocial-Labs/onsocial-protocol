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
}: {
  digit: number;
  rollSignal?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const target = mod10(digit);
  const [pos, setPos] = useState(() => parkedDigitPosition(target));
  const [motion, setMotion] = useState(false);
  const posRef = useRef(pos);
  const skipRef = useRef(true);
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

    const frame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      signalRef.current = rollSignal;
      if (reduced || motionKind === 'snap' || mod10(from) === target) {
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
  }, [reduced, rollSignal, target]);

  return (
    <span className="os-rolling-digit">
      <span
        className={
          motion
            ? 'os-rolling-digit-strip is-rolling'
            : 'os-rolling-digit-strip'
        }
        style={{ transform: `translate3d(0, ${-pos}em, 0)` }}
      >
        {Array.from({ length: STRIP_LENGTH }, (_, index) => (
          <span className="os-rolling-digit-cell" key={index}>
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
 */
export function RollingNumber({
  value,
  rollSignal,
  grouped = false,
}: {
  value: number;
  rollSignal?: number;
  grouped?: boolean;
}) {
  const glyphs = rollingGlyphs(value, grouped);
  return (
    <span className="os-rolling-number" aria-hidden="true">
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
