import { EventsLoadingScreen } from '@/features/events/events-loading-screen';

/** First entry from another route — preserve Events chrome while the panel mounts. */
export default function EventsLoading() {
  return <EventsLoadingScreen />;
}