export const portalCollapseTransition = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

/** Vote progress bar — soft fill, including first vote from 0%. */
export const portalVoteProgressTransition = {
  type: 'spring' as const,
  stiffness: 58,
  damping: 20,
  mass: 1.05,
};

export const portalCollapseMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: portalCollapseTransition,
} as const;
