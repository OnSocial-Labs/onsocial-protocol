import type { Metadata } from 'next';
import { CreateAppPanel } from '@/features/scarces/create-app-panel';

export const metadata: Metadata = {
  title: 'Open a hub • OnSocial',
  description: 'Open a branded hub to publish drops on OnSocial.',
};

export default function CreateAppPage() {
  return <CreateAppPanel />;
}
