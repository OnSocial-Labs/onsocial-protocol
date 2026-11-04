'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  DiscardConfirmSheet,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  SuffixField,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import {
  ProfileAccountSearchPicks,
  profileAccountSearchActive,
} from '@/components/profile/profile-account-search-picks';
import { NearAccountField } from '@/components/ui/near-account-field';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  HUB_MAX_APPROVED_CREATORS,
  HUB_MAX_MODERATORS,
  creatorAccessLabel,
  creatorAccessShort,
  hubUsesCreatorRoster,
  type AppView,
  type CreatorAccess,
  type TransferStayAs,
} from '@/features/scarces/apps-data';
import {
  MAX_CREATOR_BATCH,
  parseRosterAccountIds,
} from '@/features/scarces/app-roster-parse';
import { hubCategoriesMetadataFields } from '@/features/scarces/hub-categories';
import { HubCategoriesEditor } from '@/features/scarces/hub-categories-editor';
import { HubLookPreview } from '@/features/scarces/hub-look-preview';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import {
  nearAccountStatusClass,
  useNearAccountStatus,
} from '@/hooks/use-near-account-status';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { accountIdsEqual } from '@/lib/account-match';
import {
  nearAccountPlaceholder,
  normalizeNearAccountId,
} from '@/lib/app-near-account';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import { POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { SHEET_Z } from '@/lib/sheet-z';
import { topicsEqual } from '@/lib/topic-slug';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const HUB_MANAGE_Z = SHEET_Z.list;

export type HubManageSheetId =
  | 'look'
  | 'access'
  | 'people'
  | 'publish-requests'
  | 'transfer';

const ACCESS_MODES: CreatorAccess[] = ['open', 'approval', 'invite_only'];
const COMMISSION_PRESETS = [0, 2.5, 5, 10] as const;
const MAX_COMMISSION_PCT = 50;
const MAX_DESCRIPTION = 500;
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const HUB_IMAGE_TYPES = new Set(
  IMAGE_ACCEPT.split(',').map((type) => type.trim())
);

function hubLookImageError(
  file: File,
  label: 'Logo' | 'Banner'
): string | null {
  if (!HUB_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return `Use a JPG, PNG, WebP, or GIF for the ${label.toLowerCase()}.`;
  }
  if (file.size > POST_IMAGE_MAX_BYTES) {
    return `${label} must be 5 MB or smaller.`;
  }
  return null;
}

type RosterKind = 'creator' | 'moderator';

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function useHubManageWallet() {
  const { getSigningWallet } = useAppWallet();
  return useCallback(async () => {
    const { accountId, wallet } = await getSigningWallet();
    return createAppScarcesWalletClient(accountId, wallet);
  }, [getSigningWallet]);
}

function HubManageSheetChrome({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  pending = false,
  dirty = false,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  pending?: boolean;
  dirty?: boolean;
}) {
  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({ open, dirty, pending, onClose });

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={onClose}
        onClosed={clearDiscardConfirm}
        onBeforeClose={requestCloseOrConfirm}
        title={title}
        subtitle={subtitle}
        closeAriaLabel="Close"
        closeDisabled={pending}
        zIndex={HUB_MANAGE_Z}
        className="hub-manage-slide"
        contentClassName="hub-manage-slide-body"
        footer={
          footer ? (
            <div className="hub-manage-sheet-footer">{footer}</div>
          ) : null
        }
      >
        <div className="hub-manage-sheet-main">{children}</div>
      </OsSlideOverScreen>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
    </>
  );
}

export function HubLookSheet({
  open,
  app,
  onClose,
  onChanged,
}: {
  open: boolean;
  app: AppView;
  onClose: () => void;
  onChanged: () => void;
}) {
  const withWallet = useHubManageWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [name, setName] = useState(app.title);
  const [description, setDescription] = useState(app.description ?? '');
  const [categories, setCategories] = useState(app.categories);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logoPreview = useObjectUrl(logoFile);
  const bannerPreview = useObjectUrl(bannerFile);

  useEffect(() => {
    if (!open) return;
    setName(app.title);
    setDescription(app.description ?? '');
    setCategories(app.categories);
    setLogoFile(null);
    setBannerFile(null);
    setLogoRemoved(false);
    setBannerRemoved(false);
    setError(null);
  }, [open, app]);

  const displayLogoUrl = logoRemoved
    ? null
    : (logoPreview ?? app.mediaUrl ?? null);
  const displayBannerUrl = bannerRemoved
    ? null
    : (bannerPreview ?? app.bannerUrl ?? null);

  const dirty =
    name.trim() !== app.title ||
    description.trim() !== (app.description ?? '') ||
    !topicsEqual(categories, app.categories) ||
    logoFile != null ||
    bannerFile != null ||
    logoRemoved ||
    bannerRemoved;

  const save = async () => {
    if (!dirty || pending) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Hub name needs at least 2 characters.');
      return;
    }
    if (categories.length < 1) {
      setError('Pick or type a category for this hub.');
      return;
    }
    setPending(true);
    setError(null);
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
      } else if (logoRemoved) {
        image = undefined;
      }
      if (bannerFile) {
        const uploaded = await client.storage.upload(bannerFile);
        banner = `ipfs://${uploaded.cid}`;
      } else if (bannerRemoved) {
        banner = undefined;
      }
      const metadata = JSON.stringify({
        name: trimmed,
        ...hubCategoriesMetadataFields(categories),
        ...(description.trim() ? { description: description.trim() } : {}),
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
      onChanged();
      onClose();
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
  };

  return (
    <HubManageSheetChrome
      open={open}
      title="Edit look"
      subtitle="Logo, banner, name, categories"
      onClose={onClose}
      pending={pending}
      dirty={dirty}
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            ready={dirty}
            pending={pending}
            pendingLabel="Saving…"
            disabled={!dirty || pending}
            onClick={() => void save()}
          >
            Save look
          </OsSheetAction>
        </OsSheetActions>
      }
    >
      <form
        className="hub-manage-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <HubLookPreview
          bannerUrl={displayBannerUrl}
          logoUrl={displayLogoUrl}
          name={name}
          disabled={pending}
          accept={IMAGE_ACCEPT}
          onBannerChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (!file) return;
            const problem = hubLookImageError(file, 'Banner');
            if (problem) {
              setError(problem);
              return;
            }
            setError(null);
            setBannerFile(file);
            setBannerRemoved(false);
          }}
          onLogoChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (!file) return;
            const problem = hubLookImageError(file, 'Logo');
            if (problem) {
              setError(problem);
              return;
            }
            setError(null);
            setLogoFile(file);
            setLogoRemoved(false);
          }}
          onRemoveBanner={() => {
            setBannerFile(null);
            setBannerRemoved(true);
          }}
          onRemoveLogo={() => {
            setLogoFile(null);
            setLogoRemoved(true);
          }}
        />

        <label className="guild-field" htmlFor="hub-look-name">
          <span>Name</span>
          <input
            id="hub-look-name"
            type="text"
            value={name}
            maxLength={60}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
            onFocus={scrollFieldIntoView}
            onBlur={() => {
              const trimmed = name.trim().replace(/\s+/g, ' ');
              if (trimmed !== name) setName(trimmed);
            }}
            className={osFieldBorderedClassName}
          />
        </label>
        <label className="guild-field" htmlFor="hub-look-about">
          <span>About</span>
          <textarea
            id="hub-look-about"
            rows={3}
            value={description}
            maxLength={MAX_DESCRIPTION}
            disabled={pending}
            aria-describedby="hub-look-about-count"
            onChange={(event) => setDescription(event.target.value)}
            onFocus={scrollFieldIntoView}
            onBlur={() => {
              const trimmed = description.trim();
              if (trimmed !== description) setDescription(trimmed);
            }}
            className={osFieldBorderedClassName}
          />
          <small id="hub-look-about-count">
            {description.length}/{MAX_DESCRIPTION}
          </small>
        </label>
        <div className="guild-field">
          <span>Category</span>
          <HubCategoriesEditor
            categories={categories}
            onChange={setCategories}
            id="hub-look-categories"
            disabled={pending}
          />
        </div>
        {error ? <p className="guild-form-error">{error}</p> : null}
      </form>
    </HubManageSheetChrome>
  );
}

export function HubAccessSheet({
  open,
  app,
  onClose,
  onChanged,
}: {
  open: boolean;
  app: AppView;
  onClose: () => void;
  onChanged: () => void;
}) {
  const withWallet = useHubManageWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [commissionInput, setCommissionInput] = useState(app.commissionPct);
  const [creatorAccess, setCreatorAccess] = useState(app.creatorAccess);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCommissionInput(app.commissionPct);
    setCreatorAccess(app.creatorAccess);
    setError(null);
  }, [open, app]);

  const commission = Number.parseFloat(commissionInput);
  const commissionValid =
    Number.isFinite(commission) &&
    commission >= 0 &&
    commission <= MAX_COMMISSION_PCT;
  const dirty =
    creatorAccess !== app.creatorAccess ||
    (commissionValid && commission !== Number.parseFloat(app.commissionPct)) ||
    (!commissionValid && commissionInput.trim() !== app.commissionPct);

  const save = async () => {
    if (pending) return;
    if (!commissionValid) {
      setError(`Commission must be between 0 and ${MAX_COMMISSION_PCT}%.`);
      return;
    }
    if (!dirty) return;
    setPending(true);
    setError(null);
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
      onClose();
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
  };

  return (
    <HubManageSheetChrome
      open={open}
      title="Access & sales"
      subtitle="Commission and who can create drops"
      onClose={onClose}
      pending={pending}
      dirty={dirty}
      footer={
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            ready={dirty && commissionValid}
            pending={pending}
            pendingLabel="Saving…"
            disabled={!dirty || !commissionValid || pending}
            onClick={() => void save()}
          >
            Save settings
          </OsSheetAction>
        </OsSheetActions>
      }
    >
      <form
        className="hub-manage-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="guild-field" htmlFor="hub-access-commission">
          <span>Your commission</span>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Commission presets"
          >
            {COMMISSION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`os-surface-chip${
                  commission === preset ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => {
                  setCommissionInput(String(preset));
                  setError(null);
                }}
              >
                {preset}%
              </button>
            ))}
          </div>
          <SuffixField
            id="hub-access-commission"
            value={commissionInput}
            inputMode="decimal"
            onValueChange={(value) => {
              setCommissionInput(value.replace(/[^\d.]/g, ''));
              setError(null);
            }}
            placeholder="2.5"
            aria-label="Commission percentage"
            suffix="% per sale"
            disabled={pending}
          />
          <small>
            Only affects drops created after you save · max {MAX_COMMISSION_PCT}
            %.
          </small>
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
        {error ? <p className="guild-form-error">{error}</p> : null}
      </form>
    </HubManageSheetChrome>
  );
}

export function HubPeopleSheet({
  open,
  app,
  onClose,
  onChanged,
  canManageCreators,
  canManageModerators,
}: {
  open: boolean;
  app: AppView;
  onClose: () => void;
  onChanged: () => void;
  canManageCreators: boolean;
  canManageModerators: boolean;
}) {
  const withWallet = useHubManageWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [creatorInput, setCreatorInput] = useState('');
  const [moderatorInput, setModeratorInput] = useState('');
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreatorInput('');
    setModeratorInput('');
    setNote(null);
  }, [open, app.appId]);

  const showCreators =
    canManageCreators && hubUsesCreatorRoster(app.creatorAccess);

  const mutateRoster = async (
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
  };

  return (
    <HubManageSheetChrome
      open={open}
      title="People"
      subtitle="Moderators and approved creators"
      onClose={onClose}
      pending={pending}
    >
      <div className="hub-manage-form">
        {showCreators ? (
          <div className="app-manage-roster">
            <h3 className="app-manage-roster-title">Approved creators</h3>
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
            <small className="hub-manage-hint">
              One or many accounts · comma or newline · up to{' '}
              {MAX_CREATOR_BATCH} per add.
            </small>
          </div>
        ) : canManageCreators ? (
          <p className="hub-manage-hint">
            Switch access to Approval or Invite to choose who can publish.
          </p>
        ) : null}

        {canManageModerators ? (
          <div className="app-manage-roster">
            <h3 className="app-manage-roster-title">Moderators</h3>
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

        {note ? <p className="hub-manage-hint">{note}</p> : null}
      </div>
    </HubManageSheetChrome>
  );
}

export function HubTransferSheet({
  open,
  app,
  onClose,
  onChanged,
}: {
  open: boolean;
  app: AppView;
  onClose: () => void;
  onChanged: () => void;
}) {
  const withWallet = useHubManageWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [closing, setClosing] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [stayAs, setStayAs] = useState<TransferStayAs | 'none'>('moderator');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sheetOpen = open && !closing;

  const normalizedTo = normalizeNearAccountId(transferTo);
  const isSelf = accountIdsEqual(normalizedTo, app.ownerId);
  const recipientIsModerator = app.moderators.some((id) =>
    accountIdsEqual(id, normalizedTo)
  );
  const recipientIsCreator = app.approvedCreators.some((id) =>
    accountIdsEqual(id, normalizedTo)
  );
  const canStayAsModerator =
    app.moderators.length - (recipientIsModerator ? 1 : 0) < HUB_MAX_MODERATORS;
  const creatorRosterUsed = hubUsesCreatorRoster(app.creatorAccess);
  const canStayAsCreator =
    creatorRosterUsed &&
    app.approvedCreators.length - (recipientIsCreator ? 1 : 0) <
      HUB_MAX_APPROVED_CREATORS;
  const selectedStay: TransferStayAs | 'none' =
    stayAs === 'moderator' && canStayAsModerator
      ? 'moderator'
      : stayAs === 'approved_creator' && canStayAsCreator
        ? 'approved_creator'
        : 'none';

  useEffect(() => {
    if (!open) {
      setClosing(false);
      return;
    }
    setTransferTo('');
    setStayAs('moderator');
    setError(null);
  }, [open, app.appId]);

  const requestClose = useCallback(() => {
    if (pending || closing) return;
    setClosing(true);
  }, [closing, pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const accountStatus = useNearAccountStatus(transferTo);
  const recipientProfiles = usePostAuthorProfiles(
    accountStatus === 'found' && !isSelf ? [normalizedTo] : []
  );
  const recipientProfile = recipientProfiles[normalizedTo];
  const recipientLabel =
    recipientProfile?.displayName?.trim() || fallbackLabel(normalizedTo);
  const statusClass = isSelf
    ? 'is-taken'
    : nearAccountStatusClass(accountStatus);
  const dirty = transferTo.trim().length > 0;
  const canTransfer = dirty && !pending && !isSelf && accountStatus === 'found';
  const searchActive = profileAccountSearchActive(
    transferTo,
    accountStatus === 'found'
  );

  const transfer = async () => {
    const nextOwner = normalizedTo;
    if (!canTransfer || !nextOwner) return;
    setPending(true);
    setError(null);
    try {
      const client = await withWallet();
      const response = await client.scarces.apps.transferOwnership(
        app.appId,
        nextOwner,
        selectedStay === 'none' ? undefined : { stayAs: selectedStay }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.transferringAppOwnership,
        successMessage: txToastSuccess.appOwnershipTransferred,
        failureMessage: txToastError.transferAppOwnershipFailed,
      });
      if (!confirmed) return;
      onChanged();
      setClosing(true);
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
  };

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Transfer hub"
      copy="Hand ownership to another account"
      closeAriaLabel="Close transfer hub"
      backdropLabel="Close transfer hub"
      showClose={!pending}
      zIndex={SHEET_Z.list}
      panelClassName="hub-manage-sheet-panel hub-manage-sheet-panel--hug hub-transfer-sheet-panel os-sheet-cap-short"
      bodyClassName="hub-manage-sheet-body"
    >
      <div className="hub-manage-form">
        <label className="guild-field" htmlFor="hub-transfer-owner">
          <span>New owner</span>
          <NearAccountField
            id="hub-transfer-owner"
            value={transferTo}
            disabled={pending}
            placeholder={nearAccountPlaceholder()}
            status={isSelf ? 'found' : accountStatus}
            statusClass={statusClass}
            aria-invalid={
              accountStatus === 'missing' ||
              accountStatus === 'invalid' ||
              isSelf
            }
            onValueChange={(next) => {
              setError(null);
              setTransferTo(next);
            }}
          />
          <small className="hub-manage-hint is-danger">
            Permanent — you lose owner controls immediately.
          </small>
        </label>
        <ProfileAccountSearchPicks
          query={transferTo}
          enabled={searchActive && !pending}
          disabled={pending}
          excludeAccountIds={[app.ownerId]}
          viewerAccountId={app.ownerId}
          onPick={(accountId) => {
            setError(null);
            setTransferTo(accountId);
          }}
        />
        <div className="guild-field">
          <span>After transfer</span>
          <div
            className="app-storage-presets"
            role="radiogroup"
            aria-label="After transfer"
          >
            <button
              type="button"
              role="radio"
              aria-checked={selectedStay === 'none'}
              className={`os-surface-chip${
                selectedStay === 'none' ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => setStayAs('none')}
            >
              Leave
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selectedStay === 'moderator'}
              className={`os-surface-chip${
                selectedStay === 'moderator' ? ' is-selected' : ''
              }`}
              disabled={pending || !canStayAsModerator}
              onClick={() => setStayAs('moderator')}
            >
              Stay as moderator
            </button>
            {creatorRosterUsed ? (
              <button
                type="button"
                role="radio"
                aria-checked={selectedStay === 'approved_creator'}
                className={`os-surface-chip${
                  selectedStay === 'approved_creator' ? ' is-selected' : ''
                }`}
                disabled={pending || !canStayAsCreator}
                onClick={() => setStayAs('approved_creator')}
              >
                Stay as creator
              </button>
            ) : null}
          </div>
          {!canStayAsModerator ? (
            <small className="hub-manage-hint">
              Moderator seats are full ({HUB_MAX_MODERATORS}/
              {HUB_MAX_MODERATORS}).
            </small>
          ) : null}
          {creatorRosterUsed && !canStayAsCreator ? (
            <small className="hub-manage-hint">
              Creator seats are full ({HUB_MAX_APPROVED_CREATORS}/
              {HUB_MAX_APPROVED_CREATORS}).
            </small>
          ) : null}
        </div>
        {!searchActive && isSelf ? (
          <p className="hub-manage-hint">Choose another account.</p>
        ) : null}
        {!searchActive && accountStatus === 'missing' ? (
          <p className="hub-manage-hint">
            No NEAR account found for {fallbackLabel(normalizedTo)}.
          </p>
        ) : null}
        {error ? <p className="guild-form-error">{error}</p> : null}
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            variant="danger"
            ready={canTransfer}
            pending={pending}
            pendingLabel="Transferring…"
            disabled={!canTransfer}
            onClick={() => void transfer()}
          >
            {canTransfer ? `Transfer to ${recipientLabel}` : 'Transfer hub'}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    </OsHugSheet>
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
            className={osFieldBorderedClassName}
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
            className={osFieldBorderedClassName}
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
        <p className="hub-manage-hint">No one added yet.</p>
      )}
    </div>
  );
}
