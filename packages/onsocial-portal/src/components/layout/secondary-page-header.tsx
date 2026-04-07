'use client';

import { forwardRef, useEffect, useId, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import type { PortalAccent } from '@/lib/portal-colors';
import { fadeUpMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

const headerGlowColors: Record<PortalAccent, string> = {
  blue: 'rgb(96 165 250 / 0.18)',
  green: 'rgb(74 222 128 / 0.14)',
  purple: 'rgb(192 132 252 / 0.16)',
  amber: 'rgb(251 191 36 / 0.18)',
  pink: 'rgb(236 72 153 / 0.16)',
  slate: 'rgb(107 114 128 / 0.12)',
  red: 'rgb(248 113 113 / 0.16)',
};

const glowPositions = ['24% 18%', '52% 20%', '80% 24%'] as const;
const glowRadii = ['36%', '34%', '32%'] as const;

function buildGlowBackground(accents: PortalAccent[]) {
  return accents
    .slice(0, 3)
    .map(
      (accent, index) =>
        `radial-gradient(circle at ${glowPositions[index]}, ${headerGlowColors[accent]}, transparent ${glowRadii[index]})`
    )
    .join(', ');
}

interface SecondaryPageHeaderProps {
  badge: ReactNode;
  badgeAccent: PortalAccent;
  title?: ReactNode;
  description?: ReactNode;
  glowAccents?: PortalAccent[];
  align?: 'center' | 'left';
  className?: string;
  contentClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  glowClassName?: string;
  childrenClassName?: string;
  children?: ReactNode;
}

export const SecondaryPageHeader = forwardRef<
  HTMLDivElement,
  SecondaryPageHeaderProps
>(function SecondaryPageHeader(
  {
    badge,
    badgeAccent,
    title,
    description,
    glowAccents = [badgeAccent],
    align = 'center',
    className,
    contentClassName,
    titleClassName,
    descriptionClassName,
    glowClassName,
    childrenClassName,
    children,
  },
  ref
) {
  const centered = align === 'center';
  const badgeKey = useId();
  const reduceMotion = useReducedMotion();
  const { setPageBadge, clearPageBadge } =
    useMobilePageContext();

  useEffect(() => {
    setPageBadge({ key: badgeKey, badge, badgeAccent });

    return () => {
      clearPageBadge(badgeKey);
    };
  }, [badge, badgeAccent, badgeKey, clearPageBadge, setPageBadge]);

  return (
    <motion.div
      ref={ref}
      {...fadeUpMotion(!!reduceMotion, { distance: 20, duration: 0.5 })}
      className={cn(
        'relative mb-8 px-2 py-3 md:py-5',
        centered ? 'text-center' : 'text-left',
        className
      )}
    >
      {title ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-44 opacity-75 blur-3xl',
            glowClassName
          )}
          style={{ background: buildGlowBackground(glowAccents) }}
        />
      ) : null}
      <div
        className={cn(
          'relative z-10 mx-auto max-w-4xl',
          centered && 'text-center',
          contentClassName
        )}
      >
        {title ? (
          <h1
            className={cn(
              'max-w-3xl text-4xl font-bold tracking-[-0.035em] text-balance md:text-5xl',
              centered && 'mx-auto',
              titleClassName
            )}
          >
            {title}
          </h1>
        ) : null}
        {description ? (
          <p
            className={cn(
              'mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg',
              centered && 'mx-auto',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
        {children ? (
          <div
            className={cn(
              'mt-6 flex flex-wrap gap-3',
              centered ? 'justify-center' : 'justify-start',
              childrenClassName
            )}
          >
            {children}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});
