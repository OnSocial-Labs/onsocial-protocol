import type { JobSearchRow } from '@onsocial/sdk';

export const JOBS_CHANGED_EVENT = 'onsocial:jobs-changed';

export function notifyJobsChanged(accountId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(JOBS_CHANGED_EVENT, { detail: { accountId } })
  );
}

export async function fetchOpenJobs(
  accountId: string,
  signal?: AbortSignal
): Promise<JobSearchRow[]> {
  const params = new URLSearchParams({ accountId });
  const response = await fetch(`/api/jobs?${params.toString()}`, { signal });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    jobs?: JobSearchRow[];
  } | null;
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export function hiringLineLabel(count: number): string {
  if (count <= 0) return 'Hiring';
  return `Hiring · ${count}`;
}
