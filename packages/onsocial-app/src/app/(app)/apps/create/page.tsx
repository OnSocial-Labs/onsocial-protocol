import type { Metadata } from 'next';
import { CreateAppPanel } from '@/features/scarces/create-app-panel';

export const metadata: Metadata = {
  title: 'Open a store • OnSocial',
  description: 'Open a branded storefront to publish drops on OnSocial.',
};

export default function CreateAppPage() {
  return <CreateAppPanel />;
}
