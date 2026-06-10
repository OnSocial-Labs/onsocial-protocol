'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  OVERLAY_PANELS,
  OVERLAY_PANEL_LABELS,
  overlayPath,
} from '@/lib/overlay-routes';

interface PortfolioNavProps {
  accountId: string;
}

export function PortfolioNav({ accountId }: PortfolioNavProps) {
  const pathname = usePathname();

  return (
    <nav className="portfolio-nav" aria-label="Profile sections">
      {OVERLAY_PANELS.map((panel) => {
        const href = overlayPath(accountId, panel);
        const isActive = pathname.endsWith(`/${panel}`);

        return (
          <Link
            key={panel}
            href={href}
            scroll={false}
            className={`portfolio-nav-link${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {OVERLAY_PANEL_LABELS[panel]}
          </Link>
        );
      })}
    </nav>
  );
}
