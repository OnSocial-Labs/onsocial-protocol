import type { Metadata } from 'next';
import { GuildsIndexPanel } from '@/features/guilds/guilds-panels';

export const metadata: Metadata = {
  title: 'Guilds • OnSocial',
  description:
    'Collaborative OnSocial spaces with feeds, membership, roles, and optional governance.',
};

export default function GuildsPage() {
  return <GuildsIndexPanel />;
}
