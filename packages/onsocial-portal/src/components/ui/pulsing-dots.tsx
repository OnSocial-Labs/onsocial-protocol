import { cn } from '@/lib/utils';

/**
 * Modern 3-dot pulsing loader.
 *
 * Sizes map roughly to the Loader2 spinner sizes they replace:
 *  - `sm`  → w-3/h-3 inline spinners  (dot ≈ 4px)
 *  - `md`  → w-4/h-4 inline spinners  (dot ≈ 5px)
 *  - `lg`  → w-8+/h-8+ page-level spinners (dot ≈ 8px)
 */

const sizeMap = {
  sm: 'h-1 w-1',
  md: 'h-1.5 w-1.5',
  lg: 'h-2 w-2',
} as const;

const gapMap = {
  sm: 'gap-1',
  md: 'gap-1.5',
  lg: 'gap-2',
} as const;

export type PulsingDotsSize = keyof typeof sizeMap;

interface PulsingDotsProps {
  /** sm ≈ 12px row, md ≈ 16px row, lg ≈ 32px row */
  size?: PulsingDotsSize;
  /** Override the dot colour (inherits currentColor by default) */
  className?: string;
}

export function PulsingDots({ size = 'md', className }: PulsingDotsProps) {
  const dot = sizeMap[size];
  const gap = gapMap[size];

  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-center', gap, className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn('rounded-full bg-current opacity-60', dot)}
          style={{
            animation: 'pulse-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.16}s`,
          }}
        />
      ))}
      {/* Inline keyframes — zero config, no tailwind.config changes needed */}
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </span>
  );
}
