'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { portalCollapseMotion } from '@/features/governance/governance-motion';
import { cn } from '@/lib/utils';

const DESCRIPTION_CLASS =
  'max-w-3xl portal-type-body text-muted-foreground';

export function GovernanceDescriptionClamp({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);

  useEffect(() => {
    const el = measureRef.current;
    if (el) {
      setNeedsClamp(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text]);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  if (!needsClamp) {
    return (
      <div className={cn('relative', className ?? 'mt-1.5')}>
        <p
          ref={measureRef}
          aria-hidden
          className={cn(
            DESCRIPTION_CLASS,
            'pointer-events-none invisible absolute inset-x-0 top-0 line-clamp-2'
          )}
        >
          {text}
        </p>
        <p className={DESCRIPTION_CLASS}>{text}</p>
      </div>
    );
  }

  return (
    <div className={cn('relative', className ?? 'mt-1.5')}>
      <p
        ref={measureRef}
        aria-hidden
        className={cn(
          DESCRIPTION_CLASS,
          'pointer-events-none invisible absolute inset-x-0 top-0 line-clamp-2'
        )}
      >
        {text}
      </p>

      <AnimatePresence initial={false} mode="wait">
        {expanded ? (
          <motion.div
            key="description-expanded"
            {...portalCollapseMotion}
            className="overflow-hidden"
          >
            <p className={DESCRIPTION_CLASS}>{text}</p>
          </motion.div>
        ) : (
          <motion.div
            key="description-clamped"
            {...portalCollapseMotion}
            className="overflow-hidden"
          >
            <p className={cn(DESCRIPTION_CLASS, 'line-clamp-2')}>{text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((open) => !open);
        }}
        aria-expanded={expanded}
        className="mt-0.5 portal-type-label text-foreground/50 transition-colors hover:text-foreground/70"
      >
        {expanded ? 'show less' : 'show more'}
      </button>
    </div>
  );
}
