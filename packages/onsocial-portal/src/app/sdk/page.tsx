import type { Metadata } from 'next';
import { SdkHubClient } from '@/app/sdk/sdk-hub-client';

export const metadata: Metadata = {
  title: 'SDK — Build with OnSocial',
  description:
    'OnSocial SDK docs: create an app or use a server key, then every method grouped by noun.',
  openGraph: {
    title: 'SDK — Build with OnSocial',
    description:
      'Create an app or use a server key, then every SDK method grouped by noun.',
    type: 'website',
  },
};

export default function SDKPage() {
  return <SdkHubClient />;
}
