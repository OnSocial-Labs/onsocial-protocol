import { cn } from '@/lib/utils';

interface TokenIconProps {
  src?: string | null;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}

const sizeClass = {
  sm: 'h-4 w-4 portal-type-micro',
  md: 'h-5 w-5 portal-type-micro',
} as const;

/** Circular token icon with letter fallback (matches transparency page). */
export function TokenIcon({
  src,
  label,
  className,
  size = 'sm',
}: TokenIconProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={cn('rounded-full object-cover', sizeClass[size], className)}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full border border-border/50 bg-muted/40 font-bold uppercase text-foreground/80',
        sizeClass[size],
        className
      )}
    >
      {label.slice(0, 1)}
    </span>
  );
}
