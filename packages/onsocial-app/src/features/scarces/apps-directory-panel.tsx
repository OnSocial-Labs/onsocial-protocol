'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusIcon, osIconActionClassName } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  creatorAccessShort,
  fetchApps,
  type AppView,
} from '@/features/scarces/apps-data';
import { APP_APP_CREATE_PATH, appPath } from '@/lib/app-routes';
import { fallbackLabel } from '@/lib/profile-display';

function monogram(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AppsDirectoryPanel({ initial }: { initial: AppView[] }) {
  const { isConnected } = useAppWallet();
  const [apps, setApps] = useState<AppView[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);

  useEffect(() => {
    let cancelled = false;
    void fetchApps({ limit: 60 }).then((next) => {
      if (cancelled) return;
      setApps(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OsAppScreen
      title="Stores"
      subtitle="Branded storefronts publishing drops on OnSocial."
      actions={
        isConnected ? (
          <Link
            href={APP_APP_CREATE_PATH}
            className={osIconActionClassName}
            aria-label="Open a store"
          >
            <PlusIcon aria-hidden />
          </Link>
        ) : undefined
      }
    >
      <div className="apps-directory">
        {apps.length === 0 ? (
          <p className="market-page-status">
            {loading ? 'Loading stores…' : 'No stores yet. Be the first.'}
          </p>
        ) : (
          <ul className="apps-directory-grid">
            {apps.map((app) => (
              <li key={app.appId}>
                <Link
                  href={appPath(app.appId)}
                  scroll={false}
                  className="apps-directory-card"
                >
                  <span
                    className={`apps-directory-logo${app.mediaUrl ? ' has-media' : ''}`}
                    aria-hidden
                  >
                    {app.mediaUrl ? (
                      <img src={app.mediaUrl} alt="" />
                    ) : (
                      <span className="app-page-monogram">
                        {monogram(app.title)}
                      </span>
                    )}
                  </span>
                  <span className="apps-directory-body">
                    <span className="apps-directory-title">{app.title}</span>
                    <span className="apps-directory-owner">
                      @{fallbackLabel(app.ownerId)}
                    </span>
                    <span className="apps-directory-facts">
                      {app.commissionPct}% · {creatorAccessShort(app.creatorAccess)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OsAppScreen>
  );
}
