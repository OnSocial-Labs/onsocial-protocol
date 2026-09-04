'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  JOB_DESCRIPTION_MAX,
  JOB_TITLE_MAX,
  JOB_URL_MAX,
  formatJobListingMetaLabel,
  jobEndsFromDateInput,
  normalizeJobUrl,
  todayDateInput,
  type JobSearchRow,
} from '@onsocial/sdk';
import {
  DiscardConfirmSheet,
  OsHugSheet,
  OsRichTextField,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { useProfile } from '@/contexts/profile-context';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import type { TransactionFeedback } from '@/components/ui/transaction-feedback-toast';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { fetchAccountJobs, notifyJobsChanged } from '@/lib/profile-jobs';

function collectRelayTxHashes(response: unknown): string[] {
  if (!response || typeof response !== 'object') return [];
  const value = response as Record<string, unknown>;
  const direct = typeof value.txHash === 'string' ? value.txHash : null;
  const hash = typeof value.hash === 'string' ? value.hash : null;
  return [...new Set([direct, hash].filter(Boolean) as string[])];
}

export function ProfileJobsEditor({
  accountId,
  disabled = false,
  onToast,
}: {
  accountId: string;
  disabled?: boolean;
  onToast?: (toast: TransactionFeedback | null) => void;
}) {
  const formId = useId();
  const { createJob, removeJob } = useProfile();
  const { trackTransaction, setTxResult, txResult, clearTxResult } =
    useNearTransactionFeedback(accountId);
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [removeJobId, setRemoveJobId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onToast?.(txResult);
  }, [onToast, txResult]);

  const reload = useCallback(async () => {
    setJobs(await fetchAccountJobs(accountId, { includeClosed: true }));
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const notify = () => {
    notifyJobsChanged(accountId);
  };

  const handleCreate = async () => {
    const nextEnds = jobEndsFromDateInput(ends);
    if (!title.trim() || nextEnds <= Date.now()) return;
    setBusy(true);
    try {
      const { result } = await createJob({
        title,
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
        setTitle('');
        setDescription('');
        setUrl('');
        setEnds('');
        setFormOpen(false);
        notify();
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
      const result = await removeJob(jobId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: txToastPending.removingRole,
        successMessage: txToastSuccess.roleRemoved,
        failureMessage: txToastError.roleRemoveFailed,
      });
      if (confirmed) {
        setRemoveJobId(null);
        notify();
        void reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({ type: 'error', msg: txToastError.roleRemoveFailed });
    } finally {
      setBusy(false);
    }
  };

  const applyUrlInvalid = url.trim().length > 0 && !normalizeJobUrl(url);
  const canSubmit =
    title.trim().length > 0 &&
    jobEndsFromDateInput(ends) > Date.now() &&
    !applyUrlInvalid;
  const removeTitle =
    jobs.find((job) => job.jobId === removeJobId)?.title?.trim() || 'this role';

  return (
    <div className="flex flex-col gap-2">
      <p className="portal-type-body-sm text-muted-foreground/55">Hiring</p>
      {jobs.length === 0 ? (
        <p className="portal-type-body-sm text-muted-foreground/35">
          No roles yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((job) => (
            <li
              key={job.jobId}
              className="flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-semibold portal-type-body-sm">{job.title}</p>
                <p className="portal-type-body-sm text-muted-foreground/45">
                  {formatJobListingMetaLabel(job.ends)}
                  {job.url ? (
                    <>
                      <span aria-hidden> · </span>
                      <span title={job.url}>Apply link</span>
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                className="portal-type-body-sm font-semibold"
                disabled={disabled || busy}
                onClick={() => setRemoveJobId(job.jobId)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="w-fit portal-type-body-sm font-semibold"
        disabled={disabled || busy}
        onClick={() => setFormOpen(true)}
      >
        Add role
      </button>
      <OsHugSheet
        open={formOpen}
        onClose={() => {
          if (!busy) {
            setFormOpen(false);
            clearTxResult();
          }
        }}
        label="New role"
        closeAriaLabel="Close role form"
        backdropLabel="Close role form"
        zIndex={2147483647}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="submit"
                form={formId}
                ready={canSubmit && !busy}
                pending={busy}
                pendingLabel="Posting…"
                disabled={!canSubmit || busy}
              >
                Post role
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <form
          id={formId}
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <label className="flex flex-col gap-1" htmlFor={`${formId}-title`}>
            <span className="portal-type-body-sm">Title</span>
            <input
              id={`${formId}-title`}
              className={osFieldBorderedClassName}
              value={title}
              maxLength={JOB_TITLE_MAX}
              disabled={busy}
              placeholder="Front end dev"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label
            className="flex flex-col gap-1"
            htmlFor={`${formId}-description`}
          >
            <span className="portal-type-body-sm">Description</span>
            <div className={osFieldBorderedClassName}>
              <OsRichTextField
                id={`${formId}-description`}
                value={description}
                maxLength={JOB_DESCRIPTION_MAX}
                disabled={busy}
                rows={3}
                placeholder="What you’re hiring for"
                tools={['bold', 'italic', 'list']}
                onChange={setDescription}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1" htmlFor={`${formId}-ends`}>
            <span className="portal-type-body-sm">Closes</span>
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
          <label className="flex flex-col gap-1" htmlFor={`${formId}-url`}>
            <span className="portal-type-body-sm">Apply link</span>
            <input
              id={`${formId}-url`}
              className={`${osFieldBorderedClassName}${
                applyUrlInvalid ? ' is-invalid' : ''
              }`}
              value={url}
              maxLength={JOB_URL_MAX}
              disabled={busy}
              inputMode="url"
              autoComplete="url"
              placeholder="company.com/careers"
              aria-invalid={applyUrlInvalid || undefined}
              aria-errormessage={
                applyUrlInvalid ? `${formId}-url-error` : undefined
              }
              onChange={(event) => setUrl(event.target.value)}
            />
            {applyUrlInvalid ? (
              <small
                id={`${formId}-url-error`}
                className="portal-type-body-sm text-destructive"
              >
                Invalid URL
              </small>
            ) : null}
          </label>
        </form>
      </OsHugSheet>
      <DiscardConfirmSheet
        open={removeJobId !== null}
        title="Remove this role?"
        body={`“${removeTitle}” leaves your hiring list.`}
        discardLabel="Remove"
        keepEditingLabel="Keep"
        onDiscard={() => {
          if (removeJobId && !busy) void handleRemove(removeJobId);
        }}
        onKeepEditing={() => {
          if (!busy) setRemoveJobId(null);
        }}
      />
    </div>
  );
}
