import type { Metadata } from 'next';
import { DiscoverPagePanel } from '@/features/discover/discover-page-panel';

export const metadata: Metadata = {
  title: 'Discover • OnSocial',
  description: 'Discover profiles on OnSocial.',
};

export default function DiscoverPage() {
  return <DiscoverPagePanel />;
}
