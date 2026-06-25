import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app/app-shell';
import { APP_HOME_PATH } from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Groups • OnSocial',
  description: 'Groups on OnSocial — coming soon.',
};

export default function GroupsPage() {
  return (
    <AppShell>
      <div className="app-soon-page">
        <p className="app-soon-eyebrow">Coming soon</p>
        <h1 className="app-soon-title">Groups</h1>
        <p className="app-soon-copy">
          Community spaces with membership, feeds, and governance are on the
          way.
        </p>
        <Link className="app-soon-link" href={APP_HOME_PATH}>
          Back to Home
        </Link>
      </div>
    </AppShell>
  );
}
