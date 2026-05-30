import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
        dense ? 'py-1 text-[11px]' : 'py-1.5 text-[12px]'
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
            dense ? 'text-[9px]' : 'text-[10px]'
          )}
        >
          {title}
        </h3>
        {aside ? (
          <div
            className={cn(
              'shrink-0 text-muted-foreground/55',
              dense ? 'text-[9px]' : 'text-[10px]'
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
