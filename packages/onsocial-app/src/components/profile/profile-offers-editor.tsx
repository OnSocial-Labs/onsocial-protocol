'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  offerLineLabel,
  offerMaxForKind,
  OFFER_DESCRIPTION_MAX,
  OFFER_TITLE_MAX,
  OFFER_URL_MAX,
  normalizeOfferUrl,
  type OfferRecord,
  type ProfileKind,
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
import { OfferAddedTime } from '@/components/portfolio/offer-added-time';
import { ProfileBioRichTextarea } from '@/components/wallet/profile-bio-rich-textarea';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchAccountOffers,
  notifyOffersChanged,
  OFFERS_CHANGED_EVENT,
} from '@/lib/profile-offers';
import { profileBioPlainPreview } from '@/lib/profile-bio-rich';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function offerHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

export function ProfileOffersEditor({
  accountId,
  kind,
  disabled = false,
  /** Meta row owns the trigger. */
  sheetOnly = false,
  /** · Offers on an existing editor row. */
  inline = false,
  open: openProp,
  onOpenChange,
  onPreviewVisitors,
  triggerClassName,
}: {
  accountId: string;
  kind: ProfileKind | null;
  disabled?: boolean;
  sheetOnly?: boolean;
  inline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPreviewVisitors?: () => void;
  triggerClassName?: string;
}) {
  const formId = useId();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const max = offerMaxForKind(kind);
  const sheetOpen = openProp ?? uncontrolledOpen;
  const setSheetOpen = onOpenChange ?? setUncontrolledOpen;

  const reload = useCallback(() => {
    void fetchAccountOffers(accountId).then(setOffers);
  }, [accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (sheetOpen) return;
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setUrl('');
    setRemoveId(null);
  }, [sheetOpen]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ accountId?: string }>).detail;
      if (detail?.accountId && detail.accountId !== accountId) return;
      reload();
    };
    window.addEventListener(OFFERS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(OFFERS_CHANGED_EVENT, onChange);
  }, [accountId, reload]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setUrl('');
  };

  const openEdit = (offer: OfferRecord) => {
    setEditingId(offer.offerId);
    setTitle(offer.title);
    setDescription(offer.description ?? '');
    setUrl(offer.url ?? '');
    setFormOpen(true);
  };

  const openCreate = () => {
    if (offers.length >= max) return;
    resetForm();
    setFormOpen(true);
  };

  const urlInvalid = url.trim().length > 0 && !normalizeOfferUrl(url);
  const canSave = title.trim().length > 0 && !urlInvalid && !busy;
  const canAdd = offers.length < max && !busy && !disabled;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    const editing = editingId !== null;
    try {
      const { client } = await getClient();
      const { result } = await client.offers.create(
        { title, description, url },
        {
          ...(editing ? { offerId: editingId } : {}),
          accountId,
          kind,
        }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: txToastPending.savingOffer,
        successMessage: txToastSuccess.offerSaved,
        failureMessage: txToastError.offerSaveFailed,
      });
      if (confirmed) {
        resetForm();
        setFormOpen(false);
        notifyOffersChanged(accountId);
        reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({ type: 'error', msg: txToastError.offerSaveFailed });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (offerId: string) => {
    setBusy(true);
    try {
      const { client } = await getClient();
      const result = await client.offers.remove(offerId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(result),
        submittedMessage: txToastPending.removingOffer,
        successMessage: txToastSuccess.offerRemoved,
        failureMessage: txToastError.offerRemoveFailed,
      });
      if (confirmed) {
        setRemoveId(null);
        resetForm();
        setFormOpen(false);
        notifyOffersChanged(accountId);
        reload();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({ type: 'error', msg: txToastError.offerRemoveFailed });
    } finally {
      setBusy(false);
    }
  };

  if (max === 0) return null;

  const form = (
    <form
      id={formId}
      className="account-editor-sheet-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      <label className="guild-field" htmlFor={`${formId}-title`}>
        <span>Title</span>
        <input
          id={`${formId}-title`}
          className={osFieldBorderedClassName}
          value={title}
          maxLength={OFFER_TITLE_MAX}
          placeholder="Design review"
          disabled={busy}
          autoComplete="off"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="guild-field" htmlFor={`${formId}-description`}>
        <span>Description</span>
        <div
          className={`${osFieldBorderedClassName} account-editor-sheet-rich`}
        >
          <ProfileBioRichTextarea
            id={`${formId}-description`}
            value={description}
            maxLength={OFFER_DESCRIPTION_MAX}
            rows={4}
            placeholder="A one-hour look at your product"
            tools={['bold', 'italic', 'list']}
            className="account-editor-sheet-bio"
            disabled={busy}
            onChange={setDescription}
          />
        </div>
      </label>
      <label className="guild-field" htmlFor={`${formId}-url`}>
        <span>Link</span>
        <input
          id={`${formId}-url`}
          className={`${osFieldBorderedClassName}${
            urlInvalid ? ' is-invalid' : ''
          }`}
          value={url}
          maxLength={OFFER_URL_MAX}
          placeholder="studio.com/book"
          inputMode="url"
          autoComplete="url"
          disabled={busy}
          aria-invalid={urlInvalid || undefined}
          aria-errormessage={urlInvalid ? `${formId}-url-error` : undefined}
          onChange={(event) => setUrl(event.target.value)}
        />
        {urlInvalid ? (
          <small id={`${formId}-url-error`} className="is-invalid">
            Invalid URL
          </small>
        ) : null}
      </label>
    </form>
  );

  const list =
    offers.length === 0 ? (
      <p className="app-storage-meta">No offers yet.</p>
    ) : (
      <ul className="portfolio-hiring-list">
        {offers.map((offer, index) => {
          const teaser = profileBioPlainPreview(offer.description ?? '', {
            maxBlocks: 1,
          });
          return (
            <li key={offer.offerId} className="portfolio-hiring-item">
              {index > 0 ? <Divider variant="item" /> : null}
              <button
                type="button"
                className="account-editor-hiring-row"
                disabled={busy}
                onClick={() => openEdit(offer)}
              >
                <span className="portfolio-hiring-title-row">
                  <p className="portfolio-hiring-title">{offer.title}</p>
                  <OfferAddedTime since={offer.since} />
                </span>
                {teaser ? (
                  <p className="portfolio-hiring-teaser">{teaser}</p>
                ) : null}
                {offer.url ? (
                  <p className="portfolio-hiring-meta">
                    {offerHost(offer.url)}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );

  const trigger = (
    <button
      type="button"
      className={triggerClassName ?? 'portfolio-org-meta-offers'}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      aria-label={
        offers.length === 0 ? 'Manage offers' : offerLineLabel(offers.length)
      }
      onClick={() => setSheetOpen(true)}
    >
      {offerLineLabel(offers.length)}
    </button>
  );

  return (
    <>
      {sheetOnly ? null : inline ? (
        <>
          <span className="portfolio-org-meta-sep" aria-hidden>
            ·
          </span>
          {trigger}
        </>
      ) : (
        trigger
      )}

      <OsHugSheet
        open={sheetOpen}
        onClose={() => {
          if (!busy && !formOpen && removeId == null) setSheetOpen(false);
        }}
        label="Offers"
        closeAriaLabel="Close offers"
        backdropLabel="Close offers"
        zIndex={SHEET_Z.confirm}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              {onPreviewVisitors ? (
                <OsSheetAction
                  type="button"
                  variant="ghost"
                  ready={offers.length > 0}
                  disabled={offers.length === 0 || busy}
                  onClick={onPreviewVisitors}
                >
                  Preview
                </OsSheetAction>
              ) : null}
              <OsSheetAction
                type="button"
                variant="primary"
                ready={canAdd}
                disabled={!canAdd}
                onClick={openCreate}
              >
                Add offer
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        {list}
      </OsHugSheet>

      <OsHugSheet
        open={sheetOpen && formOpen}
        onClose={() => {
          if (!busy) setFormOpen(false);
        }}
        label={editingId ? 'Edit offer' : 'New offer'}
        closeAriaLabel="Close offer"
        backdropLabel="Close offer"
        zIndex={SHEET_Z.overlayNested}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              {editingId ? (
                <OsSheetAction
                  type="button"
                  variant="danger"
                  ready={!busy}
                  disabled={busy}
                  onClick={() => setRemoveId(editingId)}
                >
                  Remove
                </OsSheetAction>
              ) : null}
              <OsSheetAction
                type="submit"
                form={formId}
                variant="primary"
                ready={canSave}
                pending={busy}
                pendingLabel="Saving…"
                disabled={!canSave}
              >
                Save
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        {form}
      </OsHugSheet>

      <DiscardConfirmSheet
        open={removeId != null}
        onDiscard={() => {
          if (removeId) void handleRemove(removeId);
        }}
        onKeepEditing={() => setRemoveId(null)}
        title="Remove offer?"
        body="It leaves your profile."
        discardLabel="Remove"
        keepEditingLabel="Keep"
        pending={busy}
        zIndex={SHEET_Z.overlayNested + 2}
      />
    </>
  );
}
