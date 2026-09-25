import type { Metadata } from 'next';
import { EventsPagePanel } from '@/features/events/events-page-panel';

export const metadata: Metadata = {
  title: 'Events • OnSocial',
  description: 'Upcoming, live, and past shows on OnSocial.',
};

export default function EventsPage() {
  // eslint-disable-next-line react-hooks/purity -- Server Component; not a client render
  const initialNowMs = Date.now();
  return <EventsPagePanel initialNowMs={initialNowMs} />;
}
