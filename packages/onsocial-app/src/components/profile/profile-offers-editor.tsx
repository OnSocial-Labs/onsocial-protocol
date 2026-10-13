'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  OFFER_LINE_MAX,
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
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchAccountOffers,
  notifyOffersChanged,
  OFFERS_CHANGED_EVENT,
} from '@/lib/profile-offers';
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
  /** Org meta row owns the trigger. */
  sheetOnly = false,
  open: openProp,
  onOpenChange,
  triggerClassName,
}: {
  accountId: string;
  kind: ProfileKind | null;
  disabled?: boolean;
  sheetOnly?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  const [line, setLine] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const max = kind === 'org' ? 3 : kind === 'dao' ? 0 : 1;
  const sheetOpen = openProp ?? uncontrolledOpen;
  const setSheetOpen = onOpenChange ?? setUncontrolledOpen;

  const reload = useCallback(() => {
    void fetchAccountOffers(accountId).then(setOffers);
  }, [accountId]);

  useEffect(() => {
    reload();
  }, [reload]);

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
    setLine('');
    setUrl('');
  };

  const openEdit = (offer: OfferRecord) => {
    setEditingId(offer.offerId);
    setTitle(offer.title);
    setLine(offer.line ?? '');
    setUrl(offer.url ?? '');
    setFormOpen(true);
  };

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openSheet = () => {
    if (max <= 1) {
      const existing = offers[0];
      if (existing) openEdit(existing);
      else openCreate();
    }
    setSheetOpen(true);
  };

  const urlInvalid = url.trim().length > 0 && !normalizeOfferUrl(url);
  const canSave = title.trim().length > 0 && !urlInvalid && !busy;

  const handleSave = async () => {
    if (!canSave) return;
    setBusy(true);
    const editing = editingId !== null;
    try {
      const { client } = await getClient();
      const { result } = await client.offers.create(
        { title, line, url },
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
        if (max <= 1) setSheetOpen(false);
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
        if (max <= 1) setSheetOpen(false);
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

  const triggerLabel =
    offers.length === 0
      ? 'Offer'
      : offers.length === 1
        ? offers[0]!.title
        : `Offers · ${offers.length}`;

  const form = (
    <form
      id={formId}
      className="account-editor-offer-form"
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
          placeholder="What you offer"
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="guild-field" htmlFor={`${formId}-line`}>
        <span>Line</span>
        <input
          id={`${formId}-line`}
          className={osFieldBorderedClassName}
          value={line}
          maxLength={OFFER_LINE_MAX}
          placeholder="One line"
          disabled={busy}
          onChange={(event) => setLine(event.target.value)}
        />
      </label>
      <label className="guild-field" htmlFor={`${formId}-url`}>
        <span>Link</span>
        <input
          id={`${formId}-url`}
          className={osFieldBorderedClassName}
          value={url}
          maxLength={OFFER_URL_MAX}
          placeholder="Optional"
          inputMode="url"
          disabled={busy}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
    </form>
  );

  const list =
    max <= 1 ? (
      form
    ) : (
      <>
        {offers.length === 0 ? (
          <p className="app-storage-meta">No offer yet.</p>
        ) : (
          <ul className="portfolio-hiring-list">
            {offers.map((offer, index) => (
              <li key={offer.offerId} className="portfolio-hiring-item">
                {index > 0 ? <Divider variant="item" /> : null}
                <button
                  type="button"
                  className="account-editor-hiring-row"
                  disabled={busy}
                  onClick={() => openEdit(offer)}
                >
                  <p className="portfolio-hiring-title">{offer.title}</p>
                  {offer.line || offer.url ? (
                    <p className="portfolio-hiring-meta">
                      {offer.line ? <span>{offer.line}</span> : null}
                      {offer.line && offer.url ? (
                        <span className="portfolio-hiring-meta-sep" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {offer.url ? <span>{offerHost(offer.url)}</span> : null}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {offers.length < max ? (
          <button
            type="button"
            className="account-editor-jobs-add"
            disabled={busy}
            onClick={openCreate}
          >
            Add offer
          </button>
        ) : null}
      </>
    );

  return (
    <>
      {sheetOnly ? null : (
        <button
          type="button"
          className={
            triggerClassName ??
            'portfolio-location portfolio-offer account-editor-offer-trigger'
          }
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={openSheet}
        >
          <span
            className={
              offers.length === 0
                ? 'account-editor-org-meta-placeholder'
                : undefined
            }
          >
            {triggerLabel}
          </span>
        </button>
      )}

      <OsHugSheet
        open={sheetOpen && (max <= 1 || !formOpen)}
        onClose={() => {
          if (!busy) setSheetOpen(false);
        }}
        label={max <= 1 ? 'Offer' : 'Offers'}
        closeAriaLabel="Close offer"
        backdropLabel="Close offer"
        zIndex={SHEET_Z.confirm}
        footer={
          max <= 1 ? (
            <OsSheetFooter>
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                {editingId ? (
                  <OsSheetAction
                    type="button"
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
          ) : undefined
        }
      >
        {list}
      </OsHugSheet>

      {max > 1 ? (
        <OsHugSheet
          open={sheetOpen && formOpen}
          onClose={() => {
            if (!busy) setFormOpen(false);
          }}
          label={editingId ? 'Edit offer' : 'Offer'}
          closeAriaLabel="Close offer"
          backdropLabel="Close offer"
          zIndex={SHEET_Z.overlayNested}
          footer={
            <OsSheetFooter>
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                {editingId ? (
                  <OsSheetAction
                    type="button"
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
      ) : null}

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
