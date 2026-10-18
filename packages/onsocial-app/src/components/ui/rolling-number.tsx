'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ROLLING_DIGIT_MS,
  integerDigits,
  mod10,
  nextDigitPosition,
  parkedDigitPosition,
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

function DigitRoll({ digit }: { digit: number }) {
  const reduced = usePrefersReducedMotion();
  const target = mod10(digit);
  const [pos, setPos] = useState(() => parkedDigitPosition(target));
  const [motion, setMotion] = useState(false);
  const posRef = useRef(pos);
  const skipRef = useRef(true);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }

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
      if (reduced || mod10(from) === target) {
        const parked = parkedDigitPosition(target);
        if (posRef.current !== parked) park(parked);
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
  }, [reduced, target]);

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

/** Integer wheel. First paint is still. Later changes roll each digit the short way. */
export function RollingNumber({ value }: { value: number }) {
  const digits = integerDigits(value);
  return (
    <span className="os-rolling-number" aria-hidden="true">
      {digits.map((digit, index) => (
        <DigitRoll key={digits.length - 1 - index} digit={digit} />
      ))}
    </span>
  );
}
