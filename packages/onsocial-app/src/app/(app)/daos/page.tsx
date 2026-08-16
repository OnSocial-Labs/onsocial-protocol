import type { Metadata } from 'next';
import { DaosIndexPanel } from '@/features/protocol/daos-index-panel';

export const metadata: Metadata = {
  title: 'DAOs • OnSocial',
  description:
    'Community and protocol DAO portfolio pages — cover, square crest, and proposals.',
};

export default function DaosIndexPage() {
  return <DaosIndexPanel />;
}
