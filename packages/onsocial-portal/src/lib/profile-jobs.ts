import {
  hiringLineAriaLabel,
  hiringLineLabel,
  type DiscoverFaceFilter,
  type JobSearchRow,
} from '@onsocial/sdk';

export { hiringLineAriaLabel, hiringLineLabel };

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
  const response = await fetch(`/api/profile/jobs?${params.toString()}`, {
    signal,
  });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    jobs?: JobSearchRow[];
  } | null;
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export function discoverProfilesEmptyLabel(
  isLoading: boolean,
  query: string,
  face: DiscoverFaceFilter = 'all',
  industry = ''
): string {
  if (isLoading) return 'Finding profiles...';
  if (query.trim()) return 'No matching profiles yet.';
  if (face === 'hiring') {
    return industry
      ? `No orgs hiring in ${industry} yet.`
      : 'No orgs hiring yet.';
  }
  if (face === 'orgs') {
    return industry
      ? `No organizations in ${industry} yet.`
      : 'No organizations found.';
  }
  if (face === 'people') return 'No people found.';
  if (industry) return `No profiles in ${industry} yet.`;
  return 'No profiles found yet.';
}
