import type { ReactNode } from 'react';
import Link from 'next/link';
import { portfolioPath } from '@/lib/overlay-routes';

interface PanelPageProps {
  accountId: string;
  title?: string;
  description?: string;
  toolbar?: ReactNode;
  headerActions?: ReactNode;
  /** When the toolbar includes an inline back control (e.g. collectibles search row). */
  showBackLink?: boolean;
  children: ReactNode;
}

export function PanelPage({
  accountId,
  title,
  description,
  toolbar,
  headerActions,
  showBackLink = true,
  children,
}: PanelPageProps) {
  return (
    <main className="frame app-surface">
      <div className="portfolio-container panel-page">
        <header className="panel-page-header">
          {showBackLink ? (
            <Link className="panel-back" href={portfolioPath(accountId)}>
              ← Portfolio
            </Link>
          ) : null}
          {toolbar ? (
            <div className="panel-page-toolbar">{toolbar}</div>
          ) : (
            <div className="panel-page-heading">
              <div className="panel-page-heading-copy">
                <h1 className="panel-page-title">{title}</h1>
                {description ? (
                  <p className="panel-page-description">{description}</p>
                ) : null}
              </div>
              {headerActions ? (
                <div className="panel-page-heading-actions">{headerActions}</div>
              ) : null}
            </div>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
