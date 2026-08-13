'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Divider, GlassSheet, SheetCloseButton } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  buildSeriesBrandingPayload,
  invalidateSeriesBrandingCache,
  seriesDataPath,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MAX_TITLE = 48;
const MAX_DESCRIPTION = 280;

interface SeriesEditSheetProps {
  open: boolean;
  creatorId: string;
  seriesId: string;
  /** Current branding (null when the series was never branded). */
  branding: SeriesBranding | null;
  /** Fallback title from collection metadata when branding is unset. */
  fallbackTitle: string;
  onClose: () => void;
  onSaved: (next: SeriesBranding) => void;
}

/** Creator-only sheet: brand a series with a logo and description. */
export function SeriesEditSheet({
  open,
  creatorId,
  seriesId,
  branding,
  fallbackTitle,
  onClose,
  onSaved,
}: SeriesEditSheetProps) {
  const titleId = useId();
  const fieldIdBase = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

  // Seed the form from current branding each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTitle(branding?.title ?? fallbackTitle);
    setDescription(branding?.description ?? '');
    setLogoFile(null);
    setLogoPreview(null);
    setError(null);
  }, [open, branding, fallbackTitle]);

  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview]
  );

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const onLogoChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Logo must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const canSave = title.trim().length >= 2 && !pending;

  const save = useCallback(async () => {
    if (!canSave) return;
    setPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      let logo = branding?.logo ?? null;
      if (logoFile) {
        const uploaded = await client.storage.upload(logoFile);
        logo = `ipfs://${uploaded.cid}`;
      }
      const payload = buildSeriesBrandingPayload({
        title: title.trim(),
        description,
        logo,
      });
      const response = await client.social.set(
        seriesDataPath(seriesId),
        payload
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.savingSeries,
        successMessage: txToastSuccess.seriesSaved,
        failureMessage: txToastError.saveSeriesFailed,
      });
      if (!confirmed) return;
      invalidateSeriesBrandingCache(creatorId, seriesId);
      onSaved({
        creatorId,
        seriesId,
        title: title.trim(),
        description: description.trim() || null,
        logo,
        logoUrl: resolveProfileMediaUrl(logo),
      });
      setClosing(true);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.saveSeriesFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    canSave,
    getClient,
    branding,
    logoFile,
    title,
    description,
    seriesId,
    creatorId,
    trackTransaction,
    setTxResult,
    onSaved,
  ]);

  const logoSrc = logoPreview ?? branding?.logoUrl ?? null;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      sizing="hug"
      initialDetent="peek"
      peekRatio={1}
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close series editor"
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug"
      bodyClassName="hub-manage-sheet-body"
      header={
        <>
          <div className="standing-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    Edit series
                  </h2>
                  <p className="discover-sheet-subtitle">
                    Brand the series — drops keep their own art.
                  </p>
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close series editor"
                />
              </div>
            </div>
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="hub-manage-form">
        <div className="guild-field">
          <span>Logo</span>
          <button
            type="button"
            className={`series-logo-picker${logoSrc ? ' has-media' : ''}`}
            disabled={pending}
            onClick={() => logoInputRef.current?.click()}
            aria-label={logoSrc ? 'Change series logo' : 'Add series logo'}
          >
            {logoSrc ? (
              <img src={logoSrc} alt="" />
            ) : (
              <span aria-hidden>+</span>
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="scarce-cover-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={onLogoChange}
          />
          <small>Square works best · JPG, PNG, or WebP · up to 5 MB</small>
        </div>

        <label className="guild-field" htmlFor={`${fieldIdBase}-title`}>
          <span>Title</span>
          <input
            id={`${fieldIdBase}-title`}
            value={title}
            maxLength={MAX_TITLE}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="guild-field" htmlFor={`${fieldIdBase}-description`}>
          <span>Description (optional)</span>
          <textarea
            id={`${fieldIdBase}-description`}
            rows={3}
            value={description}
            maxLength={MAX_DESCRIPTION}
            disabled={pending}
            placeholder="What ties these drops together?"
            onChange={(event) => setDescription(event.target.value)}
          />
          <small>
            {description.length}/{MAX_DESCRIPTION}
          </small>
        </label>

        {error ? <p className="guild-form-error">{error}</p> : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="primary"
            ready={canSave}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {pending ? 'Saving…' : 'Save series'}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </GlassSheet>
  );
}
