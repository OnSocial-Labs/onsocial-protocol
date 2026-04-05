'use client';

import { forwardRef, useEffect, useId, useRef, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { PortalBadge } from '@/components/ui/portal-badge';
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
  title: ReactNode;
  description: ReactNode;
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
  const mobileBadgeAnchorRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { handoffProgress, setHandoffProgress, setPageBadge, clearPageBadge } =
    useMobilePageContext();

  useEffect(() => {
    setPageBadge({ key: badgeKey, badge, badgeAccent });

    return () => {
      clearPageBadge(badgeKey);
    };
  }, [badge, badgeAccent, badgeKey, clearPageBadge, setPageBadge]);

  useEffect(() => {
    const anchor = mobileBadgeAnchorRef.current;

    if (!anchor || typeof window === 'undefined') {
      setHandoffProgress(0);
      return;
    }

    let frameId = 0;

    const updateProgress = () => {
      if (window.innerWidth >= 768) {
        setHandoffProgress(0);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const compactProgress = Math.min(window.scrollY / 48, 1);
      const navTop = 12 - compactProgress * 7;
      const navHeight = 64 - compactProgress * 10;
      const dockCenterY = navTop + navHeight / 2;
      const sourceCenterY = rect.top + rect.height / 2;
      const sourceDistance = sourceCenterY - dockCenterY;
      const startDistance = 82;
      const endDistance = 18;
      const progress = Math.min(
        1,
        Math.max(
          0,
          1 - (sourceDistance - endDistance) / (startDistance - endDistance)
        )
      );

      setHandoffProgress(progress);
    };

    const requestUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateProgress);
    };

    requestUpdate();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      setHandoffProgress(0);
    };
  }, [setHandoffProgress]);

  const clampedHandoff = Math.min(1, Math.max(0, handoffProgress));
  const mobileSourceOpacity = reduceMotion ? 1 : 1 - clampedHandoff;
  const mobileSourceY = reduceMotion ? 0 : -clampedHandoff * 6;

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
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-44 opacity-75 blur-3xl',
          glowClassName
        )}
        style={{ background: buildGlowBackground(glowAccents) }}
      />
      <div
        className={cn(
          'relative z-10 mx-auto max-w-4xl',
          centered && 'text-center',
          contentClassName
        )}
      >
        <div
          ref={mobileBadgeAnchorRef}
          className={cn(
            'mb-4 flex flex-wrap gap-2',
            centered ? 'justify-center' : 'justify-start'
          )}
        >
          <div className={cn('hidden md:flex', centered && 'justify-center')}>
            <PortalBadge
              accent={badgeAccent}
              size="sm"
              casing="uppercase"
              tracking="normal"
            >
              {badge}
            </PortalBadge>
          </div>
          <div
            className="md:hidden"
            style={{
              opacity: mobileSourceOpacity,
              transform:
                clampedHandoff > 0
                  ? `translateY(${Math.round(mobileSourceY)}px)`
                  : undefined,
              pointerEvents: clampedHandoff > 0.9 ? 'none' : 'auto',
            }}
          >
            <PortalBadge
              accent={badgeAccent}
              size="sm"
              casing="uppercase"
              tracking="normal"
            >
              {badge}
            </PortalBadge>
          </div>
        </div>
        <h1
          className={cn(
            'max-w-3xl text-4xl font-bold tracking-[-0.035em] text-balance md:text-5xl',
            centered && 'mx-auto',
            titleClassName
          )}
        >
          {title}
        </h1>
        <p
          className={cn(
            'mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg',
            centered && 'mx-auto',
            descriptionClassName
          )}
        >
          {description}
        </p>
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
