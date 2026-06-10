import type { CSSProperties, ReactNode } from 'react';
import { PortfolioChrome } from '@/components/portfolio/portfolio-chrome';
import type { ResolvedMood } from '@/lib/moods/types';

interface PortfolioShellProps {
  mood: ResolvedMood;
  pageAccountId: string;
  activated: boolean;
  children: ReactNode;
}

export function PortfolioShell({
  mood,
  pageAccountId,
  activated,
  children,
}: PortfolioShellProps) {
  return (
    <main
      className="frame"
      data-mood={mood.id}
      style={mood.cssVars as CSSProperties}
    >
      <PortfolioChrome pageAccountId={pageAccountId} activated={activated} />
      <div className="portfolio-container">{children}</div>
    </main>
  );
}
