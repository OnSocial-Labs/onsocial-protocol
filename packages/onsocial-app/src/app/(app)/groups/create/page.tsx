import type { Metadata } from 'next';
import { GuildCreatePanel } from '@/features/guilds/guild-create-panel';

export const metadata: Metadata = {
  title: 'Create Guild • OnSocial',
  description: 'Create an OnSocial guild backed by the core groups contract.',
};

export default function CreateGuildPage() {
  return <GuildCreatePanel />;
}
