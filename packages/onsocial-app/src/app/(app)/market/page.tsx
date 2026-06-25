import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app/app-shell';
import { APP_HOME_PATH } from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'Market • OnSocial',
  description: 'Scarces marketplace on OnSocial — coming soon.',
};

export default function MarketPage() {
  return (
    <AppShell>
      <div className="app-soon-page">
        <p className="app-soon-eyebrow">Coming soon</p>
        <h1 className="app-soon-title">Market</h1>
        <p className="app-soon-copy">
          Browse, mint, and trade Scarces directly from your OnSocial page.
        </p>
        <Link className="app-soon-link" href={APP_HOME_PATH}>
          Back to Home
        </Link>
      </div>
    </AppShell>
  );
}
