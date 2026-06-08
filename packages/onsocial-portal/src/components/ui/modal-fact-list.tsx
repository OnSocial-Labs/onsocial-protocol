import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Value-side pulse placeholder for async fact rows (matches platform storage strip). */
export function ModalFactValueSkeleton({
  className,
  wide = false,
}: {
  className?: string;
  wide?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-block h-3.5 animate-pulse rounded bg-muted/35',
        wide ? 'w-24' : 'w-16',
        className
      )}
      aria-hidden
    />
  );
}

export function ModalFactRow({
  label,
  value,
  valueMono = false,
  multiline = false,
  dense = false,
}: {
  label: string;
  value: ReactNode;
  valueMono?: boolean;
  multiline?: boolean;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        dense ? 'py-1 portal-type-label' : 'py-1.5 portal-type-body-sm'
      )}
    >
      <dt className="text-muted-foreground/58">{label}</dt>
      <dd
        className={cn(
          'max-w-[60%] text-right text-foreground/86',
          valueMono && 'font-mono tabular-nums',
          !valueMono && !multiline && 'truncate font-medium',
          !valueMono && multiline && 'font-medium',
          multiline && 'whitespace-normal'
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function ModalFactSection({
  title,
  aside,
  children,
  dense = false,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <section>
      <div
        className={cn(
          'flex items-baseline justify-between gap-3',
          dense ? 'mb-0.5' : 'mb-1'
        )}
      >
        <h3
          className={cn(
            'font-medium uppercase tracking-[0.16em] text-muted-foreground/45',
            dense ? 'portal-type-micro' : 'portal-type-caption'
          )}
        >
          {title}
        </h3>
        {aside ? (
          <div
            className={cn(
              'shrink-0 text-muted-foreground/55',
              dense ? 'portal-type-micro' : 'portal-type-caption'
            )}
          >
            {aside}
          </div>
        ) : null}
      </div>
      <dl className="divide-y divide-fade-item">{children}</dl>
    </section>
  );
}
