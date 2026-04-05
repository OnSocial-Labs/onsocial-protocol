import * as React from 'react';
import { cn } from '@/lib/utils';

type MetaGridProps = React.HTMLAttributes<HTMLDListElement>;

export function MetaGrid({ className, ...props }: MetaGridProps) {
  return <dl className={cn('grid text-sm', className)} {...props} />;
}

type MetaItemProps = React.HTMLAttributes<HTMLDivElement> & {
  bordered?: boolean;
};

export function MetaItem({
  className,
  bordered = true,
  ...props
}: MetaItemProps) {
  return (
    <div
      className={cn(
        'grid gap-1',
        bordered && 'border-b border-fade-item pb-3 sm:border-b-0 sm:pb-0',
        className
      )}
      {...props}
    />
  );
}

type MetaTermProps = React.HTMLAttributes<HTMLElement>;

export function MetaTerm({ className, ...props }: MetaTermProps) {
  return (
    <dt
      className={cn(
        'text-[10px] uppercase tracking-[0.16em] text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

type MetaValueProps = React.HTMLAttributes<HTMLElement>;

export function MetaValue({ className, ...props }: MetaValueProps) {
  return <dd className={cn('text-foreground', className)} {...props} />;
}
