export const portalCollapseTransition = {
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

export const portalCollapseMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: portalCollapseTransition,
} as const;
