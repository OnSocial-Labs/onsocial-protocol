import { isJobOpen, type JobSearchRow } from '@onsocial/sdk';

export { hiringLineAriaLabel, hiringLineLabel, isJobOpen } from '@onsocial/sdk';

export const JOBS_CHANGED_EVENT = 'onsocial:jobs-changed';

export function notifyJobsChanged(accountId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(JOBS_CHANGED_EVENT, { detail: { accountId } })
  );
}

export async function fetchAccountJobs(
  accountId: string,
  opts: { includeClosed?: boolean; signal?: AbortSignal } = {}
): Promise<JobSearchRow[]> {
  const params = new URLSearchParams({ accountId });
  if (opts.includeClosed) params.set('includeClosed', '1');
  const response = await fetch(`/api/jobs?${params.toString()}`, {
    signal: opts.signal,
  });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    jobs?: JobSearchRow[];
  } | null;
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export async function fetchOpenJobs(
  accountId: string,
  signal?: AbortSignal
): Promise<JobSearchRow[]> {
  return fetchAccountJobs(accountId, { signal });
}

export function openJobsFrom(jobs: JobSearchRow[], now = Date.now()): JobSearchRow[] {
  return jobs.filter((job) => isJobOpen(job.ends, now));
}
