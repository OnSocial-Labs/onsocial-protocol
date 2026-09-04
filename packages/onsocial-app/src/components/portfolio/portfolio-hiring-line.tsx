'use client';

import { useEffect, useState } from 'react';
import { isJobOpen, type JobSearchRow } from '@onsocial/sdk';
import { PortfolioHiringMark } from '@/components/portfolio/portfolio-hiring-mark';
import { PortfolioHiringSheet } from '@/components/portfolio/portfolio-hiring-sheet';
import { ProfileJobsEditor } from '@/components/profile/profile-jobs-editor';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import {
  JOBS_CHANGED_EVENT,
  fetchAccountJobs,
  hiringLineAriaLabel,
  hiringLineLabel,
} from '@/lib/profile-jobs';
import { SHEET_Z } from '@/lib/sheet-z';

export function PortfolioHiringLine({
  accountId,
  orgName,
  initialJobs = [],
  variant = 'row',
}: {
  accountId: string;
  orgName: string;
  initialJobs?: JobSearchRow[];
  /** `inline` — · + label for the fused org meta row. */
  variant?: 'row' | 'inline';
}) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const isOwner =
    isConnected && Boolean(viewerId) && accountIdsEqual(viewerId!, accountId);
  const [jobs, setJobs] = useState<JobSearchRow[]>(initialJobs);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Reset visitor preview when the owner editor closes (render-time adjust).
  if (!open && previewOpen) {
    setPreviewOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchAccountJobs(accountId, { includeClosed: isOwner }).then(
      (next) => {
        if (!cancelled) setJobs(next);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [accountId, isOwner]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void fetchAccountJobs(accountId, { includeClosed: isOwner }).then(
        setJobs
      );
    };
    window.addEventListener(JOBS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, onChange);
  }, [accountId, isOwner]);

  const openJobs = jobs.filter((job) => isJobOpen(job.ends));
  const closedCount = jobs.length - openJobs.length;
  // Visitors: open only. Owner: keep Hiring when closed roles need manage.
  if (openJobs.length === 0 && !(isOwner && closedCount > 0)) {
    return null;
  }

  const label =
    openJobs.length > 0 ? hiringLineLabel(openJobs.length) : 'Hiring';
  const ariaLabel = isOwner
    ? openJobs.length > 0
      ? `Manage hiring · ${openJobs.length} open`
      : 'Manage hiring'
    : hiringLineAriaLabel(openJobs.length);
  const openSheet = () => setOpen(true);

  return (
    <>
      {variant === 'inline' ? (
        <>
          <span className="portfolio-org-meta-sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="portfolio-org-meta-hiring"
            aria-haspopup="dialog"
            aria-expanded={open || previewOpen}
            aria-label={ariaLabel}
            onClick={openSheet}
          >
            {label}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="portfolio-location portfolio-hiring"
          aria-haspopup="dialog"
          aria-expanded={open || previewOpen}
          aria-label={ariaLabel}
          onClick={openSheet}
        >
          <PortfolioHiringMark />
          <span>{label}</span>
        </button>
      )}
      {isOwner ? (
        <>
          <ProfileJobsEditor
            accountId={accountId}
            sheetOnly
            open={open}
            onOpenChange={setOpen}
            onPreviewVisitors={
              openJobs.length > 0 ? () => setPreviewOpen(true) : undefined
            }
          />
          <PortfolioHiringSheet
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            orgName={orgName}
            jobs={openJobs}
            zIndex={SHEET_Z.lightboxNested}
          />
        </>
      ) : (
        <PortfolioHiringSheet
          open={open}
          onClose={() => setOpen(false)}
          orgName={orgName}
          jobs={openJobs}
        />
      )}
    </>
  );
}
