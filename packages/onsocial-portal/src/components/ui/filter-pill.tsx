import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

type FilterPillProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  active?: boolean;
  label: ReactNode;
  count?: ReactNode;
  countAccent?: PortalAccent;
  variant?: 'ghost' | 'surface';
};

export function FilterPill({
  active = false,
  label,
  count,
  countAccent,
  className,
  type = 'button',
  variant = 'ghost',
  ...props
}: FilterPillProps) {
  const countStyle =
    countAccent != null
      ? ({ color: portalColors[countAccent] } satisfies CSSProperties)
      : undefined;
  const activeClass =
    variant === 'surface'
      ? 'border-foreground/25 bg-foreground/[0.06] text-foreground'
      : 'border-border/60 bg-background text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]';
  const inactiveClass =
    variant === 'surface'
      ? 'border-border/40 bg-background/45 text-muted-foreground hover:border-border/65 hover:text-foreground'
      : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground';

  return (
    <button
      type={type}
      aria-pressed={props['aria-pressed'] ?? active}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:px-2.5',
        active ? activeClass : inactiveClass,
        className
      )}
      {...props}
    >
      <span>{label}</span>
      {count != null ? (
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-medium tabular-nums leading-none transition-colors',
            active
              ? 'border-border/40 bg-background/60 text-foreground/70'
              : 'border-transparent text-muted-foreground/80',
            countAccent && 'font-semibold'
          )}
          style={countStyle}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
