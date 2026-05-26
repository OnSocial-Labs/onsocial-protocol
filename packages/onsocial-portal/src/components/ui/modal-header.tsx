import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModalHeaderProps {
  titleId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  descriptionVariant?: 'default' | 'meta';
  actions?: ReactNode;
  bordered?: boolean;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function ModalHeader({
  titleId,
  title,
  eyebrow,
  description,
  descriptionVariant = 'default',
  actions,
  bordered = false,
  className,
  titleClassName,
  descriptionClassName,
}: ModalHeaderProps) {
  return (
    <div
      className={cn(
        'relative flex items-start gap-3 px-4 pt-5 pb-3 md:px-5',
        bordered && 'border-b border-fade-section pb-4',
        className
      )}
    >
      <div className="min-w-0 flex-1 pr-10">
        {eyebrow ? (
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55">
            {eyebrow}
          </div>
        ) : null}
        <h2
          id={titleId}
          className={cn(
            'truncate text-lg font-semibold text-foreground',
            eyebrow && 'mt-1',
            titleClassName
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              descriptionVariant === 'meta'
                ? 'mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/55'
                : 'mt-0.5 text-[12px] text-muted-foreground/70',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="absolute right-3 top-3 z-10 flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
