'use client';

import { useEffect, useState } from 'react';
import {
  formatJobEndsLabel,
  type JobSearchRow,
} from '@onsocial/sdk';
import { OsHugSheet } from '@onsocial/ui';

const JOBS_CHANGED_EVENT = 'onsocial:jobs-changed';

async function fetchOpenJobs(accountId: string): Promise<JobSearchRow[]> {
  const response = await fetch(
    `/api/profile/jobs?accountId=${encodeURIComponent(accountId)}`
  );
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    jobs?: JobSearchRow[];
  } | null;
  return Array.isArray(body?.jobs) ? body.jobs : [];
}

export function ProfileHiringLine({
  accountId,
  orgName,
}: {
  accountId: string;
  orgName: string;
}) {
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOpenJobs(accountId).then((next) => {
      if (!cancelled) setJobs(next);
    });
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchOpenJobs(accountId).then(setJobs);
    };
    window.addEventListener(JOBS_CHANGED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(JOBS_CHANGED_EVENT, onChange);
    };
  }, [accountId]);

  if (jobs.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 portal-type-body-sm text-muted-foreground/45"
        onClick={() => setOpen(true)}
      >
        <span className="truncate">
          {jobs.length === 1 ? 'Hiring' : `Hiring · ${jobs.length}`}
        </span>
      </button>
      <OsHugSheet
        open={open}
        onClose={() => setOpen(false)}
        label="Hiring"
        copy={orgName}
        closeAriaLabel="Close hiring"
        backdropLabel="Close hiring"
        zIndex={2147483646}
      >
        <ul className="flex flex-col gap-4">
          {jobs.map((job) => (
            <li key={job.jobId} className="flex flex-col gap-1">
              <p className="font-semibold portal-type-body">{job.title}</p>
              {job.description ? (
                <p className="portal-type-body-sm text-muted-foreground">
                  {job.description}
                </p>
              ) : null}
              <p className="portal-type-body-sm text-muted-foreground/55">
                Ends {formatJobEndsLabel(job.ends)}
              </p>
              {job.url ? (
                <a
                  className="w-fit font-semibold portal-type-body-sm"
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Apply
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </OsHugSheet>
    </>
  );
}
