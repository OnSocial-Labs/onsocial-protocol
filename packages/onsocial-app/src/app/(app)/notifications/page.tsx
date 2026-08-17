import type { Metadata } from 'next';
import { NotificationsPanel } from '@/features/notifications/notifications-panel';

export const metadata: Metadata = {
  title: 'Activity • OnSocial',
  description: 'Stands, mentions, sales, and other OnSocial activity.',
};

export default function NotificationsPage() {
  return <NotificationsPanel />;
}
