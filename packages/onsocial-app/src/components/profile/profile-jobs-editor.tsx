'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  JOB_DESCRIPTION_MAX,
  JOB_TITLE_MAX,
  JOB_URL_MAX,
  formatJobEndsLabel,
  formatJobListingMetaLabel,
  isJobOpen,
  jobDateInputFromEnds,
  jobEndsFromDateInput,
  normalizeJobUrl,
  todayDateInput,
  type JobSearchRow,
} from '@onsocial/sdk';
import {
  DiscardConfirmSheet,
  Divider,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  OsSheetFooter,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import {
  AppDateSheet,
  formatAppDateFieldLabel,
} from '@/components/ui/app-date-sheet';
import { ProfileBioRichTextarea } from '@/components/wallet/profile-bio-rich-textarea';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { fetchAccountJobs, JOBS_CHANGED_EVENT, notifyJobsChanged } from '@/lib/profile-jobs';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function displayApplyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Apply link';
  }
}

export function ProfileJobsEditor({
  accountId,
  disabled = false,
  /** Hide the inline block; parent owns the Hiring trigger. */
  sheetOnly = false,
  open: openProp,
  onOpenChange,
  /** Owner manage → visitor Apply drawer preview (portfolio). */
  onPreviewVisitors,
}: {
  accountId: string;
  disabled?: boolean;
  sheetOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPreviewVisitors?: () => void;
}) {
  const formId = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [jobs, setJobs] = useState<JobSearchRow[]>([]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [closesOpen, setClosesOpen] = useState(false);
  const [removeJobId, setRemoveJobId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);

  const sheetOpen = openProp ?? uncontrolledOpen;
  const setSheetOpen = onOpenChange ?? setUncontrolledOpen;
  const isEditing = editingJobId !== null;

  const reload = useCallback(async () => {
    const next = await fetchAccountJobs(accountId, { includeClosed: true });
    setJobs(next);
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (sheetOpen) void reload();
  }, [sheetOpen, reload]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      void reload();
    };
    window.addEventListener(JOBS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, onChange);
  }, [accountId, reload]);

  const resetForm = () => {
    setEditingJobId(null);
    setTitle('');
    setDescription('');
    setUrl('');
    setEnds('');
  };

  const closeForm = () => {
    if (busy || closesOpen) return;
    setFormOpen(false);
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (job: JobSearchRow) => {
    setEditingJobId(job.jobId);
    setTitle(job.title ?? '');
    setDescription(job.description ?? '');
    setUrl(job.url ?? '');
    setEnds(jobDateInputFromEnds(job.ends));
    setFormOpen(true);
  };

  const handleSave = async () => {
    const nextTitle = title.trim();
    const nextEnds = jobEndsFromDateInput(ends);
    if (!nextTitle || nextEnds <= Date.now()) return;
    setBusy(true);
    const editing = editingJobId !== null;
    try {
      const { client } = await getClient();
      const { result } = await client.jobs.create(
        {
          title: nextTitle,
          description,
          url,
          ends: nextEnds,
        },
        editing ? { jobId: editingJobId } : undefined
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: editing
          ? txToastPending.savingRole
          : txToastPending.postingRole,
        successMessage: editing
          ? txToastSuccess.roleSaved
          : txToastSuccess.rolePosted,
        failureMessage: editing
          ? txToastError.roleSaveFailed
          : txToastError.rolePostFailed,
      });
      if (confirmed) {
        resetForm();
        setFormOpen(false);
        notifyJobsChanged(accountId);
        void reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg: editing
          ? txToastError.roleSaveFailed
          : txToastError.rolePostFailed,
      });
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
        setRemoveJobId(null);
        if (editingJobId === jobId) {
          setFormOpen(false);
          resetForm();
        }
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

  const removeTitle =
    jobs.find((job) => job.jobId === removeJobId)?.title?.trim() || 'this role';

  const applyUrlInvalid = url.trim().length > 0 && !normalizeJobUrl(url);
  const canSubmit =
    title.trim().length > 0 &&
    jobEndsFromDateInput(ends) > Date.now() &&
    !applyUrlInvalid;
  const closesLabel = ends
    ? formatJobEndsLabel(jobEndsFromDateInput(ends)) ||
      formatAppDateFieldLabel(ends)
    : 'Pick a day';
  const openJobCount = jobs.filter((job) => isJobOpen(job.ends)).length;
  const canPreviewVisitors =
    Boolean(onPreviewVisitors) && openJobCount > 0 && !busy && !disabled;

  const jobsList =
    jobs.length === 0 ? (
      <p className="app-storage-meta account-editor-jobs-empty">
        No roles yet.
      </p>
    ) : (
      <ul className="portfolio-hiring-list account-editor-hiring-list">
        {jobs.map((job, index) => {
          const closed = !isJobOpen(job.ends);
          return (
            <li key={job.jobId} className="portfolio-hiring-item">
              {index > 0 ? <Divider variant="item" /> : null}
              <button
                type="button"
                className={`account-editor-hiring-row${
                  closed ? ' is-closed' : ''
                }`}
                disabled={disabled || busy}
                onClick={() => openEdit(job)}
              >
                <p className="portfolio-hiring-title">{job.title}</p>
                <p className="portfolio-hiring-meta">
                  <span>{formatJobListingMetaLabel(job.ends)}</span>
                  {job.url ? (
                    <>
                      <span className="portfolio-hiring-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span title={job.url}>{displayApplyHost(job.url)}</span>
                    </>
                  ) : null}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const addRoleControl = (
    <button
      type="button"
      className="account-editor-jobs-add"
      disabled={disabled || busy}
      onClick={openCreate}
    >
      Add role
    </button>
  );

  return (
    <>
      {sheetOnly ? null : (
        <div className="account-editor-jobs">
          <p className="account-editor-jobs-label">Hiring</p>
          {jobsList}
          {addRoleControl}
        </div>
      )}

      {sheetOnly ? (
        <OsHugSheet
          open={sheetOpen}
          onClose={() => {
            if (!busy && !formOpen && !closesOpen && removeJobId === null) {
              setSheetOpen(false);
            }
          }}
          label="Hiring"
          closeAriaLabel="Close hiring"
          backdropLabel="Close hiring"
          zIndex={SHEET_Z.confirm}
          footer={
            <OsSheetFooter>
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                {onPreviewVisitors ? (
                  <OsSheetAction
                    type="button"
                    variant="ghost"
                    ready={canPreviewVisitors}
                    disabled={!canPreviewVisitors}
                    onClick={onPreviewVisitors}
                  >
                    Preview
                  </OsSheetAction>
                ) : null}
                <OsSheetAction
                  type="button"
                  variant="primary"
                  ready={!disabled && !busy}
                  disabled={disabled || busy}
                  onClick={openCreate}
                >
                  Add role
                </OsSheetAction>
              </OsSheetActions>
            </OsSheetFooter>
          }
        >
          <div className="account-editor-jobs-sheet">{jobsList}</div>
        </OsHugSheet>
      ) : null}

      <OsHugSheet
        open={formOpen}
        onClose={closeForm}
        label={isEditing ? 'Edit role' : 'New role'}
        closeAriaLabel="Close role form"
        backdropLabel="Close role form"
        zIndex={SHEET_Z.lightboxNested}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              {isEditing ? (
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={!busy}
                  disabled={busy || disabled}
                  onClick={() => {
                    if (editingJobId) setRemoveJobId(editingJobId);
                  }}
                >
                  Remove
                </OsSheetAction>
              ) : null}
              <OsSheetAction
                type="button"
                variant="primary"
                ready={canSubmit && !busy}
                pending={busy}
                pendingLabel={isEditing ? 'Saving…' : 'Posting…'}
                disabled={!canSubmit || busy}
                onClick={() => void handleSave()}
              >
                {isEditing ? 'Save role' : 'Post role'}
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <div className="account-editor-jobs-form">
          <label className="guild-field" htmlFor={`${formId}-title`}>
            <span>Title</span>
            <input
              id={`${formId}-title`}
              className={osFieldBorderedClassName}
              value={title}
              maxLength={JOB_TITLE_MAX}
              disabled={busy}
              autoComplete="off"
              placeholder="Front end dev"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="guild-field" htmlFor={`${formId}-description`}>
            <span>Description</span>
            <div className={`${osFieldBorderedClassName} account-editor-jobs-rich`}>
              <ProfileBioRichTextarea
                id={`${formId}-description`}
                value={description}
                maxLength={JOB_DESCRIPTION_MAX}
                rows={4}
                placeholder="What you’re hiring for"
                tools={['bold', 'italic', 'list']}
                className="account-editor-jobs-bio"
                disabled={busy}
                onChange={setDescription}
              />
            </div>
          </label>
          <div className="guild-field">
            <span id={`${formId}-closes-label`}>Closes</span>
            <button
              type="button"
              id={`${formId}-closes`}
              className={`${osFieldBorderedClassName} account-editor-jobs-date`}
              aria-labelledby={`${formId}-closes-label`}
              aria-haspopup="dialog"
              aria-expanded={closesOpen}
              disabled={busy}
              onClick={() => setClosesOpen(true)}
            >
              <span
                className={
                  ends
                    ? 'account-editor-jobs-date-value'
                    : 'account-editor-jobs-date-placeholder'
                }
              >
                {closesLabel}
              </span>
            </button>
          </div>
          <label className="guild-field" htmlFor={`${formId}-url`}>
            <span>Apply link</span>
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
              <small id={`${formId}-url-error`} className="is-invalid">
                Invalid URL
              </small>
            ) : null}
          </label>
        </div>
      </OsHugSheet>
      <AppDateSheet
        open={closesOpen}
        value={ends}
        min={todayDateInput()}
        label="Closes"
        confirmLabel="Set closes"
        zIndex={SHEET_Z.lightboxNested}
        onClose={() => setClosesOpen(false)}
        onChange={setEnds}
      />
      <DiscardConfirmSheet
        open={removeJobId !== null}
        title="Remove this role?"
        body={`“${removeTitle}” leaves your hiring list.`}
        discardLabel="Remove"
        keepEditingLabel="Keep"
        zIndex={SHEET_Z.lightboxNested}
        onDiscard={() => {
          if (removeJobId && !busy) void handleRemove(removeJobId);
        }}
        onKeepEditing={() => {
          if (!busy) setRemoveJobId(null);
        }}
      />
    </>
  );
}
