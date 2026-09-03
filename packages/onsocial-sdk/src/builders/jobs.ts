// ---------------------------------------------------------------------------
// builders/jobs — org hiring listings (`jobs/<jobId>`)
// ---------------------------------------------------------------------------

import { SCHEMA_VERSION } from '../schema/v1.js';
import type { SocialSetData } from './_shared.js';

export const JOB_TITLE_MAX = 80;
export const JOB_DESCRIPTION_MAX = 280;
export const JOB_URL_MAX = 512;

export interface JobBuildInput {
  title: string;
  description?: string;
  /** External apply URL. Omit for listing-only. */
  url?: string | null;
  /** Unix ms end of the listing. Required. */
  ends: number;
  since?: number;
  now?: number;
}

export function normalizeJobTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, JOB_TITLE_MAX);
}

export function normalizeJobDescription(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, JOB_DESCRIPTION_MAX);
}

export function normalizeJobUrl(raw: string): string {
  const trimmed = raw.trim().slice(0, JOB_URL_MAX);
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function createJobId(now = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `j-${now.toString(36)}-${rand}`;
}

export function isJobOpen(ends: number, now = Date.now()): boolean {
  return Number.isFinite(ends) && ends >= now;
}

export function jobPath(jobId: string): string {
  return `jobs/${jobId.trim()}`;
}

export function buildJobSetData(
  jobId: string,
  input: JobBuildInput
): SocialSetData {
  const title = normalizeJobTitle(input.title);
  if (!title) {
    throw new Error('Job title is required');
  }
  const ends = Math.floor(input.ends);
  if (!Number.isFinite(ends) || ends <= 0) {
    throw new Error('Job end date is required');
  }
  const description = normalizeJobDescription(input.description ?? '');
  const url = normalizeJobUrl(input.url ?? '');
  const since = input.since ?? input.now ?? Date.now();
  return {
    [jobPath(jobId)]: {
      v: SCHEMA_VERSION,
      title,
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      ends,
      since,
    },
  };
}

export function buildJobRemoveData(jobId: string): SocialSetData {
  return { [jobPath(jobId)]: null };
}

/** Local calendar date `YYYY-MM-DD` → end of that local day (ms). */
export function jobEndsFromDateInput(ymd: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ends = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  return Number.isFinite(ends) ? ends : 0;
}

/** Inverse of {@link jobEndsFromDateInput} for date inputs. */
export function jobDateInputFromEnds(ends: number): string {
  const date = new Date(ends);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatJobEndsLabel(ends: number): string {
  const date = new Date(ends);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function todayDateInput(now = Date.now()): string {
  return jobDateInputFromEnds(now);
}
