import type { Metadata } from 'next';
import { MarketPagePanel } from '@/features/market/market-page-panel';

export const metadata: Metadata = {
  title: 'Market • OnSocial',
  description: 'Scarces marketplace on OnSocial — coming soon.',
};

export default function MarketPage() {
  return <MarketPagePanel />;
}
