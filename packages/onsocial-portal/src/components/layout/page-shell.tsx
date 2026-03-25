import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const pageShellClasses = {
  prose: 'max-w-2xl',
  form: 'max-w-3xl',
  standard: 'max-w-3xl',
  wide: '',
} as const;

export type PageShellSize = keyof typeof pageShellClasses;

interface PageShellProps {
  children: ReactNode;
  size?: PageShellSize;
  className?: string;
}

export function PageShell({
  children,
  size = 'standard',
  className,
}: PageShellProps) {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div
        className={cn('w-full mx-auto px-4', pageShellClasses[size], className)}
      >
        {children}
      </div>
    </div>
  );
}
