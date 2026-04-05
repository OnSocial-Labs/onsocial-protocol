import type { Transition } from 'framer-motion';

export const utilityButtonClass =
  'group relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/65 text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:w-10';

export const utilityButtonActiveClass =
  'bg-background/88 text-foreground shadow-[0_12px_32px_-18px_rgba(15,23,42,0.38)]';

export const utilityIconTransition: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};
