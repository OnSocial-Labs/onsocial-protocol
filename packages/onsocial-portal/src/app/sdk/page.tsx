import type { Metadata } from 'next';
import { SdkHubClient } from '@/app/sdk/sdk-hub-client';

export const metadata: Metadata = {
  title: 'SDK — Build with OnSocial',
  description:
    'OnSocial SDK docs: on-ramps for community dapps and wallet apps, execution-path decision table, playground recipes, and method family guides.',
  openGraph: {
    title: 'SDK — Build with OnSocial',
    description:
      'On-ramps, starters, decision tables, and method family guides for the OnSocial SDK.',
    type: 'website',
  },
};

export default function SDKPage() {
  return <SdkHubClient />;
}
