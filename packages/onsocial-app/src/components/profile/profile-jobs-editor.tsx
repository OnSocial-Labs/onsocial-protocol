'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  JOB_DESCRIPTION_MAX,
  JOB_TITLE_MAX,
  JOB_URL_MAX,
  formatJobEndsLabel,
  jobEndsFromDateInput,
  todayDateInput,
  type JobSearchRow,
} from '@onsocial/sdk';
import { OsHugSheet, osFieldBorderedClassName } from '@onsocial/ui';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { fetchOpenJobs, notifyJobsChanged } from '@/lib/profile-jobs';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export function ProfileJobsEditor({
  accountId,
  disabled = false,
}: {
  accountId: string;
  disabled?: boolean;
}) {
  const formId = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const next = await fetchOpenJobs(accountId);
    setJobs(next);
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUrl('');
    setEnds('');
  };

  const handleCreate = async () => {
    const nextTitle = title.trim();
    const nextEnds = jobEndsFromDateInput(ends);
    if (!nextTitle || nextEnds <= Date.now()) return;
    setBusy(true);
    try {
      const { client } = await getClient();
      const { result } = await client.jobs.create({
        title: nextTitle,
        description,
        url,
        ends: nextEnds,
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: txToastPending.postingRole,
        successMessage: txToastSuccess.rolePosted,
        failureMessage: txToastError.rolePostFailed,
      });
      if (confirmed) {
        resetForm();
        setFormOpen(false);
        notifyJobsChanged(accountId);
        void reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({ type: 'error', msg: txToastError.rolePostFailed });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (jobId: string) => {
    setBusy(true);
    try {
      const { client } = await getClient();
      const result = await client.jobs.remove(jobId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: txToastPending.removingRole,
        successMessage: txToastSuccess.roleRemoved,
        failureMessage: txToastError.roleRemoveFailed,
      });
      if (confirmed) {
        notifyJobsChanged(accountId);
        void reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({ type: 'error', msg: txToastError.roleRemoveFailed });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    title.trim().length > 0 && jobEndsFromDateInput(ends) > Date.now();

  return (
    <div className="account-editor-jobs">
      <p className="account-editor-jobs-label">Hiring</p>
      {jobs.length === 0 ? (
        <p className="account-editor-jobs-empty">No open roles.</p>
      ) : (
        <ul className="account-editor-jobs-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="account-editor-jobs-row">
              <div>
                <p className="account-editor-jobs-title">{job.title}</p>
                <p className="account-editor-jobs-meta">
                  Ends {formatJobEndsLabel(job.ends)}
                </p>
              </div>
              <button
                type="button"
                className="account-editor-jobs-remove"
                disabled={disabled || busy}
                onClick={() => void handleRemove(job.jobId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="account-editor-jobs-add"
        disabled={disabled || busy}
        onClick={() => setFormOpen(true)}
      >
        Add role
      </button>
      <OsHugSheet
        open={formOpen}
        onClose={() => {
          if (!busy) setFormOpen(false);
        }}
        label="New role"
        copy="Title and end date required."
        closeAriaLabel="Close role form"
        backdropLabel="Close role form"
        zIndex={SHEET_Z.confirm}
      >
        <form
          className="account-editor-jobs-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <label className="guild-field" htmlFor={`${formId}-title`}>
            <span>Title</span>
            <input
              id={`${formId}-title`}
              className={osFieldBorderedClassName}
              value={title}
              maxLength={JOB_TITLE_MAX}
              disabled={busy}
              autoComplete="off"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="guild-field" htmlFor={`${formId}-description`}>
            <span>Description</span>
            <textarea
              id={`${formId}-description`}
              className={osFieldBorderedClassName}
              value={description}
              maxLength={JOB_DESCRIPTION_MAX}
              disabled={busy}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="guild-field" htmlFor={`${formId}-ends`}>
            <span>Ends</span>
            <input
              id={`${formId}-ends`}
              className={osFieldBorderedClassName}
              type="date"
              value={ends}
              min={todayDateInput()}
              disabled={busy}
              required
              onChange={(event) => setEnds(event.target.value)}
            />
          </label>
          <label className="guild-field" htmlFor={`${formId}-url`}>
            <span>Apply URL</span>
            <input
              id={`${formId}-url`}
              className={osFieldBorderedClassName}
              value={url}
              maxLength={JOB_URL_MAX}
              disabled={busy}
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="account-editor-jobs-add"
            disabled={busy || !canSubmit}
          >
            Post role
          </button>
        </form>
      </OsHugSheet>
    </div>
  );
}
