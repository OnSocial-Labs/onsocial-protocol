'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  utilityButtonActiveClass,
  utilityButtonClass,
  utilityIconTransition,
} from '@/components/ui/utility-button';

export function ThemeToggle({ className }: { className?: string } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : false;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        utilityButtonClass,
        'border border-border/45 bg-background/70 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.34)] hover:border-border/70 hover:bg-background/84',
        isDark && utilityButtonActiveClass,
        className
      )}
      aria-label="Toggle theme"
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.span
        initial={false}
        animate={{
          opacity: isDark ? 0 : 0.42,
          scale: isDark ? 0.86 : 1,
          rotate: isDark ? -18 : 0,
        }}
        transition={utilityIconTransition}
        className={cn(
          'pointer-events-none absolute inset-1 rounded-[0.9rem]',
          isDark
            ? 'bg-[color:var(--portal-blue-frame-bg)]'
            : 'bg-[color:var(--portal-amber-frame-bg)]'
        )}
      />

      <motion.span
        initial={false}
        animate={{
          opacity: isDark ? 0.5 : 0,
          scale: isDark ? 1 : 0.86,
          rotate: isDark ? 0 : 18,
        }}
        transition={utilityIconTransition}
        className="pointer-events-none absolute inset-1 rounded-[0.9rem] bg-[color:var(--portal-blue-frame-bg)]"
      />

      <motion.span
        initial={false}
        animate={{
          rotate: isDark ? 180 : 0,
          scale: isDark ? 1 : 0.94,
          opacity: isDark ? 0.14 : 0.08,
        }}
        transition={utilityIconTransition}
        className="pointer-events-none absolute inset-[7px] rounded-[0.8rem] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_62%)]"
      />

      <span className="relative z-10 h-4 w-4">
        <motion.span
          initial={false}
          animate={
            isDark
              ? { scale: 0.62, rotate: 70, y: 2, opacity: 0 }
              : { scale: 1, rotate: 0, y: 0, opacity: 1 }
          }
          transition={utilityIconTransition}
          className="absolute inset-0 flex items-center justify-center portal-amber-text"
        >
          <Sun className="h-4 w-4" />
        </motion.span>
        <motion.span
          initial={false}
          animate={
            isDark
              ? { scale: 1, rotate: 0, y: 0, opacity: 1 }
              : { scale: 0.62, rotate: -70, y: -2, opacity: 0 }
          }
          transition={utilityIconTransition}
          className="absolute inset-0 flex items-center justify-center portal-blue-text"
        >
          <Moon className="h-4 w-4" />
        </motion.span>

        <motion.span
          initial={false}
          animate={{
            opacity: isDark ? 0.72 : 0.52,
            scale: isDark ? 0.96 : 0.84,
          }}
          transition={utilityIconTransition}
          className={cn(
            'absolute inset-0 rounded-full blur-[6px]',
            isDark
              ? 'bg-[var(--portal-blue)]/18'
              : 'bg-[var(--portal-amber)]/20'
          )}
        />
      </span>
    </button>
  );
}
