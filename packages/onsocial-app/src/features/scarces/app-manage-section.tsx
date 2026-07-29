'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  creatorAccessLabel,
  creatorAccessShort,
  type AppView,
  type CreatorAccess,
} from '@/features/scarces/apps-data';
import {
  HUB_CATEGORIES,
  type HubCategory,
} from '@/features/scarces/hub-categories';
import { accountIdsEqual } from '@/lib/account-match';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  MAX_CREATOR_BATCH,
  parseRosterAccountIds,
} from '@/features/scarces/app-roster-parse';

const ACCESS_MODES: CreatorAccess[] = ['open', 'approval', 'invite_only'];
const MAX_COMMISSION_PCT = 50;

type RosterKind = 'creator' | 'moderator';

export function AppManageSection({
  app,
  onChanged,
  canManageSettings = true,
  canManageCreators = true,
}: {
  app: AppView;
  onChanged: () => void;
  /** Owner-only: commission, access mode, moderator roster. */
  canManageSettings?: boolean;
  /** Owner or moderator: approved creators roster. */
  canManageCreators?: boolean;
}) {
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [open, setOpen] = useState(false);
  const [commissionInput, setCommissionInput] = useState(app.commissionPct);
  const [creatorAccess, setCreatorAccess] = useState<CreatorAccess>(
    app.creatorAccess
  );
  const [creatorInput, setCreatorInput] = useState('');
  const [moderatorInput, setModeratorInput] = useState('');
  const [brandName, setBrandName] = useState(app.title);
  const [brandDescription, setBrandDescription] = useState(
    app.description ?? ''
  );
  const [brandCategory, setBrandCategory] = useState<HubCategory>(
    app.category ?? 'other'
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [showBranding, setShowBranding] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const withWallet = useCallback(async () => {
    const { accountId, wallet } = await getSigningWallet();
    return createAppScarcesWalletClient(accountId, wallet);
  }, [getSigningWallet]);

  const commission = Number.parseFloat(commissionInput);
  const commissionValid =
    Number.isFinite(commission) &&
    commission >= 0 &&
    commission <= MAX_COMMISSION_PCT;
  const settingsDirty =
    creatorAccess !== app.creatorAccess ||
    (commissionValid && commission !== Number.parseFloat(app.commissionPct));

  const brandingDirty =
    brandName.trim() !== app.title ||
    brandDescription.trim() !== (app.description ?? '') ||
    brandCategory !== (app.category ?? 'other') ||
    logoFile != null ||
    bannerFile != null;

  const saveSettings = useCallback(async () => {
    if (!commissionValid || pending) return;
    setPending(true);
    setNote(null);
    try {
      const client = await withWallet();
      const response = await client.scarces.apps.setConfig(app.appId, {
        primarySaleBps: Math.round(commission * 100),
        creatorAccess,
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.updatingApp,
        successMessage: txToastSuccess.appUpdated,
        failureMessage: txToastError.updateAppFailed,
      });
      if (!confirmed) return;
      onChanged();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.updateAppFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    commissionValid,
    pending,
    withWallet,
    app.appId,
    commission,
    creatorAccess,
    trackTransaction,
    setTxResult,
    onChanged,
  ]);

  const saveBranding = useCallback(async () => {
    if (!brandingDirty || pending) return;
    const name = brandName.trim();
    if (name.length < 2) {
      setNote('Hub name needs at least 2 characters.');
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const client = await withWallet();
      let image: string | undefined;
      let banner: string | undefined;
      try {
        if (app.metadataRaw) {
          const parsed = JSON.parse(app.metadataRaw) as {
            image?: string;
            media?: string;
            banner?: string;
          };
          image = parsed.image ?? parsed.media;
          banner = parsed.banner;
        }
      } catch {
        // ignore malformed metadata
      }

      if (logoFile) {
        const uploaded = await client.storage.upload(logoFile);
        image = `ipfs://${uploaded.cid}`;
      }
      if (bannerFile) {
        const uploaded = await client.storage.upload(bannerFile);
        banner = `ipfs://${uploaded.cid}`;
      }

      const metadata = JSON.stringify({
        name,
        category: brandCategory,
        ...(brandDescription.trim()
          ? { description: brandDescription.trim() }
          : {}),
        ...(image ? { image } : {}),
        ...(banner ? { banner } : {}),
      });
      const response = await client.scarces.apps.setConfig(app.appId, {
        metadata,
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.updatingApp,
        successMessage: txToastSuccess.appUpdated,
        failureMessage: txToastError.updateAppFailed,
      });
      if (!confirmed) return;
      setLogoFile(null);
      setBannerFile(null);
      setShowBranding(false);
      onChanged();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.updateAppFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    brandingDirty,
    pending,
    brandName,
    brandDescription,
    brandCategory,
    logoFile,
    bannerFile,
    app.metadataRaw,
    withWallet,
    app.appId,
    trackTransaction,
    setTxResult,
    onChanged,
  ]);

  const transferOwnership = useCallback(async () => {
    const nextOwner = transferTo.trim().toLowerCase();
    if (!nextOwner || pending) return;
    if (accountIdsEqual(nextOwner, app.ownerId)) {
      setNote('That account already owns this hub.');
      return;
    }
    setPending(true);
    setNote(null);
    try {
      const client = await withWallet();
      const response = await client.scarces.apps.transferOwnership(
        app.appId,
        nextOwner
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.transferringAppOwnership,
        successMessage: txToastSuccess.appOwnershipTransferred,
        failureMessage: txToastError.transferAppOwnershipFailed,
      });
      if (!confirmed) return;
      setTransferTo('');
      onChanged();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.transferAppOwnershipFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    transferTo,
    pending,
    app.ownerId,
    app.appId,
    withWallet,
    trackTransaction,
    setTxResult,
    onChanged,
  ]);

  const mutateRoster = useCallback(
    async (
      kind: RosterKind,
      accountId: string,
      action: 'add' | 'remove',
      resetInput?: () => void
    ) => {
      if (pending) return;

      if (kind === 'creator' && action === 'add') {
        const ids = parseRosterAccountIds(accountId).filter(
          (id) => !accountIdsEqual(id, app.ownerId)
        );
        if (ids.length === 0) {
          setNote(
            accountId.trim()
              ? 'You already own this hub — add other accounts.'
              : 'Add one or more account IDs.'
          );
          return;
        }
        if (ids.length > MAX_CREATOR_BATCH) {
          setNote(`Add at most ${MAX_CREATOR_BATCH} creators at a time.`);
          return;
        }
        setPending(true);
        setNote(null);
        try {
          const client = await withWallet();
          const response = await client.scarces.apps.addApprovedCreators(
            app.appId,
            ids
          );
          const confirmed = await trackTransaction({
            txHashes: collectRelayTxHashes(response),
            submittedMessage: txToastConfirming.updatingAppCreators,
            successMessage: txToastSuccess.appCreatorsUpdated,
            failureMessage: txToastError.updateAppCreatorsFailed,
          });
          if (!confirmed) return;
          resetInput?.();
          onChanged();
        } catch (cause) {
          if (isWalletUserCancellation(cause)) return;
          setTxResult({
            type: 'error',
            msg:
              cause instanceof Error
                ? cause.message
                : txToastError.updateAppCreatorsFailed,
          });
        } finally {
          setPending(false);
        }
        return;
      }

      const id = accountId.trim().toLowerCase();
      if (!id) return;
      if (action === 'add' && accountIdsEqual(id, app.ownerId)) {
        setNote('You already own this hub.');
        return;
      }
      setPending(true);
      setNote(null);
      try {
        const client = await withWallet();
        const apps = client.scarces.apps;
        const response =
          kind === 'creator'
            ? await apps.removeApprovedCreator(app.appId, id)
            : action === 'add'
              ? await apps.addModerator(app.appId, id)
              : await apps.removeModerator(app.appId, id);
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.updatingAppCreators,
          successMessage: txToastSuccess.appCreatorsUpdated,
          failureMessage: txToastError.updateAppCreatorsFailed,
        });
        if (!confirmed) return;
        resetInput?.();
        onChanged();
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastError.updateAppCreatorsFailed,
        });
      } finally {
        setPending(false);
      }
    },
    [
      pending,
      app.ownerId,
      app.appId,
      withWallet,
      trackTransaction,
      setTxResult,
      onChanged,
    ]
  );

  if (!open) {
    return (
      <button
        type="button"
        className="collection-allowlist-toggle"
        onClick={() => setOpen(true)}
      >
        {canManageSettings ? 'Manage hub' : 'Approve creators'}
      </button>
    );
  }

  const showCreatorRoster =
    canManageCreators &&
    (canManageSettings
      ? creatorAccess === 'approval'
      : app.creatorAccess === 'approval');

  return (
    <section
      className="app-manage"
      aria-label={canManageSettings ? 'Manage hub' : 'Approve creators'}
    >
      <div className="collection-allowlist-head">
        <h3 className="market-section-title">
          {canManageSettings ? 'Manage hub' : 'Approve creators'}
        </h3>
        <button
          type="button"
          className="collection-allowlist-close"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      </div>

      {canManageSettings ? (
        <>
          <label className="guild-field" htmlFor="app-manage-commission">
            <span>Commission</span>
            <div className="app-storage-amount-field">
              <input
                id="app-manage-commission"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={commissionInput}
                onChange={(event) =>
                  setCommissionInput(event.target.value.replace(/[^\d.]/g, ''))
                }
                className="app-storage-amount-input"
                disabled={pending}
                aria-label="Commission percentage"
              />
              <span className="account-card-balance-unit">% per sale</span>
            </div>
            <small>Only affects drops created after you save.</small>
          </label>

          <div className="guild-field">
            <span>Who can create drops</span>
            <div
              className="app-storage-presets"
              role="radiogroup"
              aria-label="Who can create drops"
            >
              {ACCESS_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={creatorAccess === mode}
                  className={`os-surface-chip${
                    creatorAccess === mode ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setCreatorAccess(mode)}
                >
                  {creatorAccessShort(mode)}
                </button>
              ))}
            </div>
            <small>{creatorAccessLabel(creatorAccess)}</small>
          </div>

          <OsSheetActions layout="stack" tone="frosted-primary" borderless>
            <OsSheetAction
              type="button"
              variant="primary"
              ready={settingsDirty && !pending}
              disabled={!settingsDirty || pending}
              onClick={() => void saveSettings()}
            >
              {pending ? 'Saving…' : 'Save settings'}
            </OsSheetAction>
          </OsSheetActions>

          <div className="app-manage-secondary">
            <button
              type="button"
              className="collection-allowlist-toggle"
              onClick={() => setShowBranding((open) => !open)}
            >
              {showBranding ? 'Hide look' : 'Edit look'}
            </button>
            {showBranding ? (
              <div className="app-manage-roster">
                <label className="guild-field" htmlFor="app-manage-name">
                  <span>Name</span>
                  <input
                    id="app-manage-name"
                    type="text"
                    value={brandName}
                    maxLength={60}
                    disabled={pending}
                    onChange={(event) => setBrandName(event.target.value)}
                  />
                </label>
                <label className="guild-field" htmlFor="app-manage-about">
                  <span>About</span>
                  <textarea
                    id="app-manage-about"
                    rows={3}
                    value={brandDescription}
                    maxLength={500}
                    disabled={pending}
                    onChange={(event) => setBrandDescription(event.target.value)}
                  />
                </label>
                <div className="guild-field">
                  <span>Category</span>
                  <div
                    className="app-storage-presets"
                    role="radiogroup"
                    aria-label="Hub category"
                  >
                    {HUB_CATEGORIES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={brandCategory === option.id}
                        className={`os-surface-chip${
                          brandCategory === option.id ? ' is-selected' : ''
                        }`}
                        disabled={pending}
                        onClick={() => setBrandCategory(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="guild-field" htmlFor="app-manage-logo-file">
                  <span>Logo</span>
                  <input
                    id="app-manage-logo-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={pending}
                    onChange={(event) => {
                      setLogoFile(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <small>
                    {logoFile
                      ? logoFile.name
                      : app.mediaUrl
                        ? 'Current logo kept unless you pick a new file.'
                        : 'Optional square mark.'}
                  </small>
                </label>
                <label className="guild-field" htmlFor="app-manage-banner-file">
                  <span>Banner</span>
                  <input
                    id="app-manage-banner-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={pending}
                    onChange={(event) => {
                      setBannerFile(event.target.files?.[0] ?? null);
                      event.target.value = '';
                    }}
                  />
                  <small>
                    {bannerFile
                      ? bannerFile.name
                      : app.bannerUrl
                        ? 'Current banner kept unless you pick a new file.'
                        : 'Optional wide cover.'}
                  </small>
                </label>
                <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                  <OsSheetAction
                    type="button"
                    variant="primary"
                    ready={brandingDirty && !pending}
                    disabled={!brandingDirty || pending}
                    onClick={() => void saveBranding()}
                  >
                    {pending ? 'Saving…' : 'Save look'}
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            ) : null}

            <button
              type="button"
              className="collection-allowlist-toggle"
              onClick={() => setShowTransfer((open) => !open)}
            >
              {showTransfer ? 'Hide transfer' : 'Transfer hub'}
            </button>
            {showTransfer ? (
              <div className="app-manage-roster">
                <label className="guild-field" htmlFor="app-manage-transfer">
                  <span>New owner</span>
                  <input
                    id="app-manage-transfer"
                    type="text"
                    autoComplete="off"
                    value={transferTo}
                    disabled={pending}
                    placeholder="account.near"
                    onChange={(event) => setTransferTo(event.target.value)}
                  />
                  <small>
                    Permanent. You become a regular account on this hub.
                  </small>
                </label>
                <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                  <OsSheetAction
                    type="button"
                    variant="danger"
                    ready={transferTo.trim().length > 0 && !pending}
                    disabled={transferTo.trim().length === 0 || pending}
                    onClick={() => void transferOwnership()}
                  >
                    {pending ? 'Transferring…' : 'Transfer hub'}
                  </OsSheetAction>
                </OsSheetActions>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {showCreatorRoster ? (
        <div className="app-manage-roster">
          <h4 className="app-manage-roster-title">Approved creators</h4>
          <RosterEditor
            placeholder="creator.near, artist.near"
            multiline
            value={creatorInput}
            onChange={setCreatorInput}
            disabled={pending}
            onAdd={() =>
              void mutateRoster('creator', creatorInput, 'add', () =>
                setCreatorInput('')
              )
            }
            members={app.approvedCreators}
            onRemove={(id) => void mutateRoster('creator', id, 'remove')}
          />
          <small>
            One or many accounts · comma or newline · up to {MAX_CREATOR_BATCH}{' '}
            per add.
          </small>
        </div>
      ) : null}

      {canManageSettings ? (
        <div className="app-manage-roster">
          <h4 className="app-manage-roster-title">Moderators</h4>
          <RosterEditor
            placeholder="mod.near"
            value={moderatorInput}
            onChange={setModeratorInput}
            disabled={pending}
            onAdd={() =>
              void mutateRoster('moderator', moderatorInput, 'add', () =>
                setModeratorInput('')
              )
            }
            members={app.moderators}
            onRemove={(id) => void mutateRoster('moderator', id, 'remove')}
          />
        </div>
      ) : null}

      {note ? <p className="collection-mint-hint">{note}</p> : null}
    </section>
  );
}

function RosterEditor({
  placeholder,
  value,
  onChange,
  disabled,
  onAdd,
  members,
  onRemove,
  multiline = false,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onAdd: () => void;
  members: string[];
  onRemove: (id: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="app-roster-editor">
      <div className="app-roster-add">
        {multiline ? (
          <textarea
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Accounts to add"
            rows={3}
          />
        ) : (
          <input
            type="text"
            autoComplete="off"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Account to add"
          />
        )}
        <button
          type="button"
          className="os-surface-chip"
          disabled={disabled || value.trim().length === 0}
          onClick={onAdd}
        >
          Add
        </button>
      </div>
      {members.length > 0 ? (
        <ul className="app-roster-members">
          {members.map((id) => (
            <li key={id} className="app-roster-member">
              <Link
                href={portfolioPath(id)}
                scroll={false}
                className="app-roster-member-handle"
              >
                @{fallbackLabel(id)}
              </Link>
              <button
                type="button"
                className="app-roster-member-remove"
                disabled={disabled}
                onClick={() => onRemove(id)}
                aria-label={`Remove ${id}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="collection-mint-hint">No one added yet.</p>
      )}
    </div>
  );
}
