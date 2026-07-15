import type { Metadata } from 'next';
import { HomePagePanel } from '@/features/home/home-feed';

export const metadata: Metadata = {
  title: 'Home • OnSocial',
  description: 'Your OnSocial home feed.',
};

export default function HomePage() {
  return <HomePagePanel />;
}
