'use client';

import { useEffect, useState } from 'react';
import type { JobSearchRow } from '@onsocial/sdk';
import { PortfolioHiringMark } from '@/components/portfolio/portfolio-hiring-mark';
import { PortfolioHiringSheet } from '@/components/portfolio/portfolio-hiring-sheet';
import {
  JOBS_CHANGED_EVENT,
  fetchOpenJobs,
  hiringLineLabel,
} from '@/lib/profile-jobs';

export function PortfolioHiringLine({
  accountId,
  orgName,
  initialJobs = [],
}: {
  accountId: string;
  orgName: string;
  initialJobs?: JobSearchRow[];
}) {
  const [jobs, setJobs] = useState<JobSearchRow[]>(initialJobs);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOpenJobs(accountId).then((next) => {
      if (!cancelled) setJobs(next);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchOpenJobs(accountId).then(setJobs);
    };
    window.addEventListener(JOBS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, onChange);
  }, [accountId]);

  if (jobs.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="portfolio-location portfolio-hiring"
        onClick={() => setOpen(true)}
      >
        <PortfolioHiringMark />
        <span>{hiringLineLabel(jobs.length)}</span>
      </button>
      <PortfolioHiringSheet
        open={open}
        onClose={() => setOpen(false)}
        orgName={orgName}
        jobs={jobs}
      />
    </>
  );
}
