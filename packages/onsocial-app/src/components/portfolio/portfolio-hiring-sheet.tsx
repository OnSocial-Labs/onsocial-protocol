'use client';

import {
  formatJobEndsLabel,
  type JobSearchRow,
} from '@onsocial/sdk';
import { OsHugSheet } from '@onsocial/ui';
import { SHEET_Z } from '@/lib/sheet-z';

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
  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
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
          {jobs.map((job) => (
            <li key={job.jobId} className="portfolio-hiring-item">
              <p className="portfolio-hiring-title">{job.title}</p>
              {job.description ? (
                <p className="portfolio-hiring-copy">{job.description}</p>
              ) : null}
              <p className="portfolio-hiring-meta">
                Ends {formatJobEndsLabel(job.ends)}
              </p>
              {job.url ? (
                <a
                  className="portfolio-hiring-apply"
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
      )}
    </OsHugSheet>
  );
}
