import * as React from 'react';
import { cn } from '@/lib/utils';

type InsetDividerMode = 'vertical' | 'responsive';

interface InsetDividerGroupProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  showTopDivider?: boolean;
  topDividerClassName?: string;
  topDividerSpacingClassName?: string;
}

export function InsetDividerGroup({
  children,
  className,
  contentClassName,
  showTopDivider = false,
  topDividerClassName,
  topDividerSpacingClassName = 'mt-4',
}: InsetDividerGroupProps) {
  return (
    <div className={className}>
      {showTopDivider ? (
        <div className={cn('h-px divider-detail', topDividerClassName)} />
      ) : null}
      <div
        className={cn(
          showTopDivider && topDividerSpacingClassName,
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface InsetDividerItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showDivider?: boolean;
  dividerMode?: InsetDividerMode;
  dividerClassName?: string;
}

export function InsetDividerItem({
  children,
  className,
  style,
  showDivider = false,
  dividerMode = 'vertical',
  dividerClassName,
}: InsetDividerItemProps) {
  return (
    <div className={cn('relative min-w-0', className)} style={style}>
      {children}
      {showDivider ? (
        <span
          className={cn(
            dividerMode === 'responsive'
              ? 'absolute bottom-0 left-4 right-4 h-px divider-detail md:bottom-0 md:left-auto md:right-0 md:top-0 md:h-full md:w-px md:divider-v-detail'
              : 'absolute right-0 top-0 h-full w-px divider-v-detail',
            dividerClassName
          )}
        />
      ) : null}
    </div>
  );
}
