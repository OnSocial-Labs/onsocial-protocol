import type { Metadata } from 'next';
import { HubsIndexPanel } from '@/features/scarces/hubs-index-panel';

export const metadata: Metadata = {
  title: 'Hubs • OnSocial',
  description: 'Creator hubs publishing drops on OnSocial.',
};

export default function AppsPage() {
  return <HubsIndexPanel />;
}
