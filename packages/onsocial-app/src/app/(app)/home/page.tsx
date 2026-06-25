import type { Metadata } from 'next';
import { AppShell } from '@/components/app/app-shell';
import { HomeFeed } from '@/features/home/home-feed';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

export default function HomePage() {
  return (
    <AppShell>
      <HomeFeed />
    </AppShell>
  );
}
