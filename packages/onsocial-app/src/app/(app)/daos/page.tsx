import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DaosIndexPanel } from '@/features/protocol/daos-index-panel';

export const metadata: Metadata = {
  title: 'DAOs • OnSocial',
  description: 'Your DAO memberships — create an org or open a portfolio.',
};

export default function DaosIndexPage() {
  return (
    <Suspense fallback={null}>
      <DaosIndexPanel />
    </Suspense>
  );
}
