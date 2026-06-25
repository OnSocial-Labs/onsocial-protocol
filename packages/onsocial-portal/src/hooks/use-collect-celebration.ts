'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export const CLAIM_CELEBRATION_TIMEOUT_MS = 2100;
export const REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS = 1400;
export const INLINE_CLAIM_CELEBRATION_TIMEOUT_MS = 1400;
export const REDUCED_MOTION_INLINE_CLAIM_CELEBRATION_TIMEOUT_MS = 1000;

export type CollectCelebrationState = {
  id: number;
  amountLabel: string;
};

export type CollectCelebrationVariant = 'hero' | 'inline';

export function useCollectCelebration({
  onComplete,
  variant = 'hero',
}: {
  onComplete?: () => void;
  variant?: CollectCelebrationVariant;
} = {}) {
  const reduceMotion = useReducedMotion();
  const [celebration, setCelebration] =
    useState<CollectCelebrationState | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  const durationSeconds =
    variant === 'inline'
      ? reduceMotion
        ? 1
        : 1.35
      : reduceMotion
        ? 1.15
        : 1.75;
  const timeoutMs =
    variant === 'inline'
      ? reduceMotion
        ? REDUCED_MOTION_INLINE_CLAIM_CELEBRATION_TIMEOUT_MS
        : INLINE_CLAIM_CELEBRATION_TIMEOUT_MS
      : reduceMotion
        ? REDUCED_MOTION_CLAIM_CELEBRATION_TIMEOUT_MS
        : CLAIM_CELEBRATION_TIMEOUT_MS;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clearCelebration = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCelebration(null);
  }, []);

  const triggerCelebration = useCallback(
    (amountLabel: string) => {
      const trimmed = amountLabel.trim();
      if (!trimmed || trimmed === '0') return;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const id = Date.now();
      setCelebration({ id, amountLabel: trimmed });
      timeoutRef.current = setTimeout(() => {
        setCelebration((current) => (current?.id === id ? null : current));
        timeoutRef.current = null;
        onCompleteRef.current?.();
      }, timeoutMs);
    },
    [timeoutMs]
  );

  return {
    celebration,
    triggerCelebration,
    clearCelebration,
    durationSeconds,
    reduceMotion,
  };
}
