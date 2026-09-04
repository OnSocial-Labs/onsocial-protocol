'use client';

import { useEffect, useState } from 'react';
import { formatJobClosesLabel, type JobSearchRow } from '@onsocial/sdk';
import {
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  ProtocolMotionArrow,
} from '@onsocial/ui';
import { PortfolioBioBlocks } from '@/components/portfolio/portfolio-bio-blocks';
import { profileBioPlainPreview } from '@/lib/profile-bio-rich';
import { SHEET_Z } from '@/lib/sheet-z';

function JobDetailSheet({
  open,
  onClose,
  orgName,
  job,
  zIndex,
}: {
  open: boolean;
  onClose: () => void;
  orgName: string;
  job: JobSearchRow | null;
  zIndex: number;
}) {
  if (!job) return null;
  const closes = formatJobClosesLabel(job.ends);
  const applyUrl = job.url?.trim() || '';
  const description = job.description?.trim() || '';

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      label={job.title}
      copy={orgName}
      closeAriaLabel="Close role"
      backdropLabel="Close role"
      zIndex={zIndex}
      footer={
        applyUrl ? (
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                className="group portfolio-hiring-apply-action"
                aria-label="Apply — opens in a new tab"
                onClick={() => {
                  window.open(applyUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Apply
                <ProtocolMotionArrow className="portfolio-hiring-apply-arrow" />
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        ) : undefined
      }
    >
      {description ? (
        <div className="portfolio-hiring-detail-copy">
          <PortfolioBioBlocks text={description} headingAs="p" />
        </div>
      ) : null}
      {closes ? (
        <>
          <Divider
            variant="detail"
            className="portfolio-hiring-detail-divider"
          />
          <p className="portfolio-hiring-meta portfolio-hiring-detail-meta">
            {closes}
          </p>
        </>
      ) : null}
    </OsHugSheet>
  );
}

export function PortfolioHiringSheet({
  open,
  onClose,
  orgName,
  jobs,
  zIndex = SHEET_Z.list,
}: {
  open: boolean;
  onClose: () => void;
  orgName: string;
  jobs: JobSearchRow[];
  zIndex?: number;
}) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob =
    jobs.find((job) => job.jobId === selectedJobId) ?? null;
  const detailOpen = Boolean(selectedJob);

  useEffect(() => {
    if (!open) setSelectedJobId(null);
  }, [open]);

  return (
    <>
      <OsHugSheet
        open={open}
        onClose={() => {
          if (detailOpen) return;
          onClose();
        }}
        label="Hiring"
        copy={orgName}
        closeAriaLabel="Close hiring"
        backdropLabel="Close hiring"
        zIndex={zIndex}
      >
        {jobs.length === 0 ? (
          <p className="app-storage-meta">No open roles right now.</p>
        ) : (
          <ul className="portfolio-hiring-list">
            {jobs.map((job, index) => {
              const closes = formatJobClosesLabel(job.ends);
              const teaser = profileBioPlainPreview(job.description ?? '', {
                maxBlocks: 1,
              });
              return (
                <li key={job.jobId} className="portfolio-hiring-item">
                  {index > 0 ? <Divider variant="item" /> : null}
                  <button
                    type="button"
                    className="portfolio-hiring-row"
                    onClick={() => setSelectedJobId(job.jobId)}
                  >
                    <p className="portfolio-hiring-title">{job.title}</p>
                    {teaser ? (
                      <p className="portfolio-hiring-teaser">{teaser}</p>
                    ) : null}
                    {closes ? (
                      <p className="portfolio-hiring-meta">{closes}</p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </OsHugSheet>
      <JobDetailSheet
        open={detailOpen}
        onClose={() => setSelectedJobId(null)}
        orgName={orgName}
        job={selectedJob}
        zIndex={Math.max(zIndex + 2, SHEET_Z.nested)}
      />
    </>
  );
}
