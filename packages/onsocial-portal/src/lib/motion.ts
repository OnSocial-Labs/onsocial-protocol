import type { Transition } from 'framer-motion';

export const portalEase = [0.22, 1, 0.36, 1] as const;

export function portalTransition(duration = 0.24, delay = 0): Transition {
  return {
    duration,
    delay,
    ease: portalEase,
  };
}

export function fadeUpMotion(
  reduceMotion: boolean,
  {
    distance = 16,
    duration = 0.24,
    delay = 0,
    exitDistance = Math.max(6, Math.round(distance * 0.65)),
  }: {
    distance?: number;
    duration?: number;
    delay?: number;
    exitDistance?: number;
  } = {}
) {
  return {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: distance },
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -exitDistance },
    transition: portalTransition(duration, delay),
  };
}

export function scaleFadeMotion(
  reduceMotion: boolean,
  {
    y = 12,
    scale = 0.98,
    duration = 0.26,
    delay = 0,
    exitY = Math.max(8, Math.round(y * 0.8)),
    exitScale = scale + 0.01,
  }: {
    y?: number;
    scale?: number;
    duration?: number;
    delay?: number;
    exitY?: number;
    exitScale?: number;
  } = {}
) {
  return {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y, scale },
    animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
    exit: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, y: -exitY, scale: exitScale },
    transition: portalTransition(duration, delay),
  };
}

export function fadeMotion(duration = 0.22, delay = 0) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: portalTransition(duration, delay),
  };
}
