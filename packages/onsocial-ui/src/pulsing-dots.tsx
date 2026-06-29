import { cn } from './cn.js';

export type PulsingDotsSize = 'sm' | 'md' | 'lg';

export interface PulsingDotsProps {
  /** sm ≈ pill pending, md ≈ inline actions, lg ≈ page-level */
  size?: PulsingDotsSize;
  className?: string;
  /** Screen-reader label — defaults to "Loading". */
  label?: string;
}

export function PulsingDots({
  size = 'md',
  className,
  label = 'Loading',
}: PulsingDotsProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'protocol-pulsing-dots',
        `protocol-pulsing-dots--${size}`,
        className
      )}
    >
      <span className="protocol-pulsing-dots__dot" aria-hidden />
      <span className="protocol-pulsing-dots__dot" aria-hidden />
      <span className="protocol-pulsing-dots__dot" aria-hidden />
    </span>
  );
}
