import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const pageShellClasses = {
  prose: 'max-w-2xl',
  form: 'max-w-3xl',
  standard: 'max-w-3xl',
  section: 'max-w-6xl',
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
    <div className="min-h-screen pt-[72px] pb-16 md:pt-20">
      <div
        className={cn('w-full mx-auto px-4', pageShellClasses[size], className)}
      >
        {children}
      </div>
    </div>
  );
}
