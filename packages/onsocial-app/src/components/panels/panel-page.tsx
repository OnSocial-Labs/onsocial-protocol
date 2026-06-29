import type { ReactNode } from 'react';
import Link from 'next/link';
import { portfolioPath } from '@/lib/overlay-routes';

interface PanelPageProps {
  accountId: string;
  title?: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function PanelPage({
  accountId,
  title,
  description,
  toolbar,
  children,
}: PanelPageProps) {
  return (
    <main className="frame app-surface">
      <div className="portfolio-container panel-page">
        <header className="panel-page-header">
          <Link className="panel-back" href={portfolioPath(accountId)}>
            ← Portfolio
          </Link>
          {toolbar ? (
            <div className="panel-page-toolbar">{toolbar}</div>
          ) : (
            <div className="panel-page-heading">
              <h1 className="panel-page-title">{title}</h1>
              {description ? (
                <p className="panel-page-description">{description}</p>
              ) : null}
            </div>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
