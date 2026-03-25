import type { Application } from '@/features/governance/types';

export async function fetchGovernanceFeed(): Promise<Application[]> {
  const res = await fetch('/api/governance');
  if (!res.ok) throw new Error('Failed to fetch governance feed');
  const data = (await res.json()) as {
    success: boolean;
    applications: Application[];
  };
  return data.applications;
}
