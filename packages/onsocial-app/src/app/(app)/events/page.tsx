import type { Metadata } from 'next';
import { EventsPagePanel } from '@/features/events/events-page-panel';

export const metadata: Metadata = {
  title: 'Events • OnSocial',
  description: 'Upcoming, live, and past shows on OnSocial.',
};

type EventsPageProps = {
  searchParams?: Promise<{ q?: string | string[] }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const resolved = (await searchParams) ?? {};
  // eslint-disable-next-line react-hooks/purity -- Server Component; not a client render
  const initialNowMs = Date.now();
  return (
    <EventsPagePanel
      initialNowMs={initialNowMs}
      initialQuery={firstParam(resolved.q)}
    />
  );
}
