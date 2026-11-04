'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { GroupMemberRow } from '@onsocial/sdk';
import {
  AmountField,
  AmountFieldMetaRow,
  ChevronLeftIcon,
  ChevronRightIcon,
  GLASS_SHEET_PEEK_RATIO,
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  PlusIcon,
} from '@onsocial/ui';
import {
  StorageShareGrantsReadout,
  StorageSharePoolReadout,
  StorageShareRecipientRow,
  StorageShareSplitVisual,
  guildStoragePoolHeroMeta,
} from '@/components/wallet/app-storage-share-ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  ProfileAccountSearchPicks,
  profileAccountSearchActive,
} from '@/components/profile/profile-account-search-picks';
import { useGroupStoragePool } from '@/hooks/use-group-storage-pool';
import { useGroupStorageGrants } from '@/hooks/use-group-storage-grants';
import { useStorageShareRecipientsValidation } from '@/hooks/use-storage-share-recipients';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import { finalizeAmountInput } from '@/lib/amount-input';
import {
  normalizeNearAccountId,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  sendGroupPoolDepositTransaction,
  sendGroupSponsorDefaultTransaction,
  sendGroupSponsorQuotaBatchTransaction,
  sendGroupSponsorQuotaDisableTransaction,
} from '@/lib/app-storage-transactions';
import { formatNearCompact } from '@/lib/format-near-balance';
import { formatCompactBytes } from '@/lib/platform-storage-display';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  clampStorageNearAmountInput,
  formatStorageMinNearLabel,
  GUILD_STORAGE_DEFAULT_HINT,
  GUILD_STORAGE_GRANT_HINT,
  GUILD_STORAGE_LABEL,
  GUILD_STORAGE_POOL_DEPOSIT_HINT,
  isValidShareBytesPerRecipient,
  isValidStorageAmountInput,
  MAX_STORAGE_SHARE_RECIPIENTS,
  parseStorageAmountYocto,
  resolveSharePoolBudgetBytes,
  splitShareBytesPerRecipient,
  storageCapacityBytesFromNearInput,
  STORAGE_NEAR_INPUT_DECIMALS,
  STORAGE_SHARE_PERCENT_PRESETS,
  STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
  STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR,
} from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

const GUILD_RECIPIENT_ISSUE = {
  self: 'You cannot grant yourself guild storage.',
  already_sponsored: 'Already has a guild grant.',
} as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Transaction did not go through.';
}

export function GuildGroupStorageSheet({
  open,
  groupId,
  guildName,
  initialRecipient = null,
  onClose,
  zIndex = SHEET_Z.list,
}: {
  open: boolean;
  groupId: string;
  guildName?: string;
  initialRecipient?: string | null;
  onClose: () => void;
  zIndex?: number;
}) {
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const { accountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const baseId = useId();
  const [refreshKey, setRefreshKey] = useState(0);
  const pool = useGroupStoragePool(groupId, sheetOpen, refreshKey);
  const walletNear = useWalletNearBalance(accountId, sheetOpen, refreshKey);
  const walletNearYocto = walletNear.balanceYocto;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddCapacity, setShowAddCapacity] = useState(false);
  const [showDefaultEditor, setShowDefaultEditor] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('0.1');
  const [rows, setRows] = useState<string[]>(['']);
  const [sharePercent, setSharePercent] = useState(100);
  const [defaultPercent, setDefaultPercent] = useState(25);
  const [pendingGrantTargets, setPendingGrantTargets] = useState<string[]>([]);
  const [rosterMembers, setRosterMembers] = useState<GroupMemberRow[]>([]);

  const activeGrants = useGroupStorageGrants(
    groupId,
    sheetOpen,
    refreshKey,
    pendingGrantTargets
  );

  const knownGrantIds = useMemo(
    () => activeGrants.grants.map((grant) => grant.accountId),
    [activeGrants.grants]
  );

  const rosterAccountIds = useMemo(
    () => rosterMembers.map((member) => member.memberId),
    [rosterMembers]
  );

  useEffect(() => {
    if (!sheetOpen) {
      setPending(false);
      setError(null);
      setShowAddCapacity(false);
      setShowDefaultEditor(false);
      setComposerOpen(false);
      setFundAmountInput('0.1');
      setRows(['']);
      setSharePercent(100);
      setDefaultPercent(25);
      setPendingGrantTargets([]);
      return;
    }

    if (initialRecipient?.trim()) {
      setRows([sanitizeNearAccountInput(initialRecipient)]);
      setComposerOpen(true);
    }
  }, [initialRecipient, sheetOpen]);

  useEffect(() => {
    setError(null);
  }, [
    fundAmountInput,
    rows,
    sharePercent,
    defaultPercent,
    showAddCapacity,
    showDefaultEditor,
    composerOpen,
  ]);

  useEffect(() => {
    if (pendingGrantTargets.length === 0) return;
    const grantIds = new Set(
      activeGrants.grants
        .filter((grant) => grant.maxBytes > 0)
        .map((grant) => grant.accountId)
    );
    if (pendingGrantTargets.every((targetId) => grantIds.has(targetId))) {
      setPendingGrantTargets([]);
    }
  }, [activeGrants.grants, pendingGrantTargets]);

  useEffect(() => {
    if (!sheetOpen || !composerOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const page = await client.query.groups.membersOf(groupId, {
          limit: 120,
        });
        if (cancelled) return;
        setRosterMembers(page.items ?? []);
      } catch {
        if (cancelled) return;
        setRosterMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [composerOpen, groupId, sheetOpen]);

  const requestClose = useCallback(() => {
    if (closing || pending) return;
    setClosing(true);
  }, [closing, pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const summary = pool.summary;
  const poolUnavailable = Boolean(pool.error);
  const needsFunding =
    !pool.loading &&
    !poolUnavailable &&
    (summary?.totalCapacityBytes ?? 0) <= 0;
  const showFundPanel = (needsFunding || showAddCapacity) && !composerOpen;
  const showHome =
    Boolean(accountId) &&
    !composerOpen &&
    !needsFunding &&
    !poolUnavailable &&
    !pool.loading;
  const showGrantFlow =
    Boolean(accountId) && composerOpen && !poolUnavailable && !needsFunding;

  const shareBudgetBytes = resolveSharePoolBudgetBytes({
    availableBytes: summary?.availableBytes ?? 0,
    sharedBytes: summary?.sharedBytes ?? 0,
    totalCapacityBytes: summary?.totalCapacityBytes ?? 0,
  });

  const recipientValidation = useStorageShareRecipientsValidation(
    rows,
    accountId ?? '',
    showGrantFlow,
    {
      knownSponsoredIds: knownGrantIds,
      localSponsoredOnly: true,
    }
  );

  const readyRecipients = recipientValidation.readyNormalizedIds;

  const bytesPerRecipient = splitShareBytesPerRecipient(
    shareBudgetBytes,
    Math.max(1, readyRecipients.length),
    sharePercent
  );
  const defaultMaxBytes = splitShareBytesPerRecipient(
    shareBudgetBytes,
    1,
    defaultPercent
  );
  const canGrant =
    Boolean(accountId) &&
    !pending &&
    !needsFunding &&
    readyRecipients.length > 0 &&
    isValidShareBytesPerRecipient(bytesPerRecipient) &&
    recipientValidation.statuses.every(
      (status) => status === 'empty' || status === 'ready'
    );
  const canSetDefault =
    Boolean(accountId) &&
    !pending &&
    !needsFunding &&
    isValidShareBytesPerRecipient(defaultMaxBytes);

  const normalizedFundAmount = useMemo(
    () => finalizeAmountInput(fundAmountInput, STORAGE_NEAR_INPUT_DECIMALS),
    [fundAmountInput]
  );
  const fundPreviewCapacityBytes =
    storageCapacityBytesFromNearInput(normalizedFundAmount);
  const canFundAmount = isValidStorageAmountInput(
    normalizedFundAmount,
    'deposit',
    {
      minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
      maxYocto: walletNearYocto ?? undefined,
    }
  );

  const applyFundAmountInput = useCallback(
    (value: string) => {
      setFundAmountInput(
        clampStorageNearAmountInput(value, {
          maxYocto: walletNearYocto ?? undefined,
        })
      );
    },
    [walletNearYocto]
  );

  const refreshAfterTx = () => setRefreshKey((key) => key + 1);
  const defaultQuota = activeGrants.defaultQuota;
  const defaultEnabled = Boolean(
    defaultQuota?.enabled && defaultQuota.maxBytes > 0
  );

  const handleFundPool = async () => {
    if (!accountId) return;
    let amountYocto: bigint;
    try {
      amountYocto = parseStorageAmountYocto(normalizedFundAmount, 'deposit', {
        minYocto: STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO,
        maxYocto: walletNearYocto ?? undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid amount.');
      return;
    }

    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupPoolDepositTransaction(
        getSigningWallet,
        groupId,
        amountYocto.toString()
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.fundingGroupStorage,
        successMessage: txToastSuccess.groupStorageFunded,
        failureMessage: txToastError.groupStorageFundFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastError.groupStorageFundFailed,
      });
      return;
    } finally {
      setPending(false);
    }

    setShowAddCapacity(false);
    setFundAmountInput('0.1');
    refreshAfterTx();
  };

  const handleGrant = async () => {
    if (!canGrant) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorQuotaBatchTransaction(
        getSigningWallet,
        groupId,
        readyRecipients.map((targetAccountId) => ({
          targetAccountId,
          maxBytes: bytesPerRecipient,
        }))
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.grantingGroupStorage,
        successMessage: txToastSuccess.groupStorageGranted,
        failureMessage: txToastError.groupStorageGrantFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
      setPendingGrantTargets((current) => [
        ...new Set([...current, ...readyRecipients]),
      ]);
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastError.groupStorageGrantFailed,
      });
      return;
    } finally {
      setPending(false);
    }

    setRows(['']);
    refreshAfterTx();
  };

  const handleSetDefault = async () => {
    if (!canSetDefault) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorDefaultTransaction(
        getSigningWallet,
        groupId,
        {
          enabled: true,
          allowanceMaxBytes: defaultMaxBytes,
          dailyRefillBytes: 0,
        }
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.settingGroupStorageDefault,
        successMessage: txToastSuccess.groupStorageDefaultSet,
        failureMessage: txToastError.groupStorageDefaultFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastError.groupStorageDefaultFailed,
      });
      return;
    } finally {
      setPending(false);
    }

    setShowDefaultEditor(false);
    refreshAfterTx();
  };

  const handleClearDefault = async () => {
    if (!accountId || pending) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorDefaultTransaction(
        getSigningWallet,
        groupId,
        { enabled: false, allowanceMaxBytes: 0, dailyRefillBytes: 0 }
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.settingGroupStorageDefault,
        successMessage: txToastSuccess.groupStorageDefaultSet,
        failureMessage: txToastError.groupStorageDefaultFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastError.groupStorageDefaultFailed,
      });
      return;
    } finally {
      setPending(false);
    }

    setShowDefaultEditor(false);
    refreshAfterTx();
  };

  const handleRevoke = async (targetAccountId: string) => {
    if (!accountId || pending) return;
    setError(null);
    setPending(true);
    try {
      const txHashes = await sendGroupSponsorQuotaDisableTransaction(
        getSigningWallet,
        groupId,
        targetAccountId
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.revokingGroupStorage,
        successMessage: txToastSuccess.groupStorageRevoked,
        failureMessage: txToastError.groupStorageRevokeFailed,
        onFailure: (message) => setError(message),
      });
      if (!confirmed) return;
    } catch (err) {
      if (isWalletUserCancellation(err)) return;
      const message = getErrorMessage(err);
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastError.groupStorageRevokeFailed,
      });
      return;
    } finally {
      setPending(false);
    }

    refreshAfterTx();
  };

  const amountHint = formatStorageMinNearLabel(
    STORAGE_SHARE_POOL_DEPOSIT_MIN_YOCTO
  );
  const totalShareBytes = bytesPerRecipient * readyRecipients.length;
  const allocatedPercent =
    (summary?.totalCapacityBytes ?? 0) > 0
      ? Math.min(
          100,
          Math.round(
            ((summary?.sharedBytes ?? 0) / (summary?.totalCapacityBytes ?? 1)) *
              100
          )
        )
      : 0;

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label={GUILD_STORAGE_LABEL}
      copy={guildName?.trim() || 'Guild pool and member grants'}
      closeAriaLabel="Close"
      backdropLabel="Close guild storage"
      zIndex={zIndex}
      initialDetent="peek"
      peekRatio={GLASS_SHEET_PEEK_RATIO}
      headerClassName="account-storage-header"
      panelClassName="account-storage-panel os-sheet-cap-tall"
    >
      <div className="app-storage-sheet">
        <div className="app-storage-share-panel">
          {!accountId ? (
            <p className="app-storage-meta">
              Connect a wallet to manage guild storage.
            </p>
          ) : null}

          {accountId && !composerOpen ? (
            <StorageSharePoolReadout
              label="Guild pool"
              summary={summary}
              loading={pool.loading}
              error={pool.error}
              errorMessage="Guild storage unavailable right now."
              canAddCapacity={!needsFunding && !pool.loading && !pool.error}
              showAddCapacity={showAddCapacity}
              onToggleAddCapacity={() => {
                setShowAddCapacity((openPanel) => !openPanel);
              }}
              capacityHint="Pool capacity for members who write in this guild."
              heroMeta={guildStoragePoolHeroMeta(
                summary?.storageBalanceYocto ?? 0n,
                allocatedPercent
              )}
            />
          ) : null}

          {accountId && showFundPanel ? (
            <div className="app-storage-share-fund">
              <p className="app-storage-meta">
                Add NEAR to this guild&apos;s shared storage pool.
              </p>
              <AmountField
                value={fundAmountInput}
                onValueChange={applyFundAmountInput}
                maxDecimals={STORAGE_NEAR_INPUT_DECIMALS}
                placeholder={amountHint}
                aria-label="Guild pool fund amount in NEAR"
                invalid={Boolean(fundAmountInput) && !canFundAmount}
                unit="NEAR"
                disabled={pending}
              />
              <AmountFieldMetaRow
                presets={STORAGE_SHARE_POOL_DEPOSIT_PRESETS_NEAR}
                selectedValue={normalizedFundAmount}
                onSelectPreset={applyFundAmountInput}
                presetsAriaLabel="Quick fund amounts"
                disabled={pending}
                meta={
                  <>
                    {fundPreviewCapacityBytes != null &&
                    fundPreviewCapacityBytes > 0 ? (
                      <>≈ {formatCompactBytes(fundPreviewCapacityBytes)} · </>
                    ) : null}
                    {walletNearYocto != null ? (
                      <>
                        Balance {formatNearCompact(walletNearYocto.toString())}{' '}
                        ·{' '}
                      </>
                    ) : null}
                    Min {amountHint}
                  </>
                }
              />
              {error ? (
                <p className="app-storage-error" role="alert">
                  {error}
                </p>
              ) : null}
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                <OsSheetAction
                  type="button"
                  ready={!pending && canFundAmount && !error}
                  pending={pending}
                  pendingLabel="Adding…"
                  disabled={pending || !canFundAmount}
                  onClick={() => void handleFundPool()}
                >
                  {needsFunding ? 'Fund guild pool' : 'Add to guild pool'}
                </OsSheetAction>
              </OsSheetActions>
              <p className="app-storage-hint app-storage-hint--compact">
                {GUILD_STORAGE_POOL_DEPOSIT_HINT}
              </p>
            </div>
          ) : null}

          {showHome ? (
            <>
              <div className="app-storage-share-card">
                <div className="app-storage-share-card-head">
                  <span className="account-card-wallet-label">
                    Default for members
                  </span>
                  <button
                    type="button"
                    className="app-storage-share-link os-disabled-ink"
                    onClick={() => setShowDefaultEditor((current) => !current)}
                    disabled={pending}
                  >
                    {showDefaultEditor
                      ? 'Cancel'
                      : defaultEnabled
                        ? 'Edit'
                        : 'Set'}
                  </button>
                </div>
                {!showDefaultEditor ? (
                  <p className="app-storage-meta">
                    {defaultEnabled && defaultQuota
                      ? `${formatCompactBytes(defaultQuota.maxBytes)} for members without a personal grant.`
                      : 'No default yet. Members need a personal grant.'}
                  </p>
                ) : (
                  <>
                    <div
                      className="app-storage-presets"
                      role="group"
                      aria-label="Default member storage percent"
                    >
                      {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`os-surface-chip${
                            defaultPercent === preset ? ' is-selected' : ''
                          }`}
                          onClick={() => setDefaultPercent(preset)}
                          disabled={pending}
                        >
                          {preset === 100 ? 'Max' : `${preset}%`}
                        </button>
                      ))}
                    </div>
                    <p className="app-storage-meta">
                      {formatCompactBytes(defaultMaxBytes)} per member without a
                      personal grant.
                    </p>
                    <OsSheetActions
                      layout="stack"
                      tone="frosted-primary"
                      borderless
                    >
                      <OsSheetAction
                        type="button"
                        ready={!pending && canSetDefault && !error}
                        pending={pending}
                        pendingLabel="Saving…"
                        disabled={pending || !canSetDefault}
                        onClick={() => void handleSetDefault()}
                      >
                        Save default
                      </OsSheetAction>
                    </OsSheetActions>
                    {defaultEnabled ? (
                      <button
                        type="button"
                        className="app-storage-share-link os-disabled-ink"
                        disabled={pending}
                        onClick={() => void handleClearDefault()}
                      >
                        Turn off default
                      </button>
                    ) : null}
                    <p className="app-storage-hint app-storage-hint--compact">
                      {GUILD_STORAGE_DEFAULT_HINT}
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                className="os-surface-row os-surface-row--navigate app-storage-choice"
                onClick={() => {
                  setShowAddCapacity(false);
                  setShowDefaultEditor(false);
                  setComposerOpen(true);
                }}
              >
                <span className="os-surface-row-copy">
                  <span className="os-surface-row-label">
                    Add storage for members
                  </span>
                  <span className="os-surface-row-description">
                    {GUILD_STORAGE_GRANT_HINT}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="os-surface-row-arrow"
                />
              </button>

              <StorageShareGrantsReadout
                label="Granted to"
                grants={activeGrants.grants}
                loading={activeGrants.loading}
                error={activeGrants.error}
                errorMessage="Active grants unavailable right now."
                pending={pending}
                onRevoke={(targetId) => void handleRevoke(targetId)}
                grantUsageLabel={(id) => `${id} guild storage usage`}
              />
            </>
          ) : null}

          {showGrantFlow ? (
            <div className="app-storage-share-flow">
              <button
                type="button"
                className="app-storage-back"
                onClick={() => setComposerOpen(false)}
              >
                <ChevronLeftIcon
                  aria-hidden
                  className="app-storage-back-icon"
                />
                Guild pool
              </button>
              <div className="app-storage-share-recipients">
                <div className="app-storage-share-card-head">
                  <span className="account-card-wallet-label">Members</span>
                  <button
                    type="button"
                    className="app-storage-share-link os-disabled-ink"
                    onClick={() =>
                      setRows((current) =>
                        current.length >= MAX_STORAGE_SHARE_RECIPIENTS
                          ? current
                          : [...current, '']
                      )
                    }
                    disabled={
                      pending || rows.length >= MAX_STORAGE_SHARE_RECIPIENTS
                    }
                  >
                    <PlusIcon
                      aria-hidden
                      className="app-storage-share-add-icon"
                    />
                    Add
                  </button>
                </div>
                {rows.map((row, index) => {
                  const status = recipientValidation.statuses[index] ?? 'empty';
                  const accountResolved =
                    status === 'ready' || status === 'already_sponsored';
                  const searchActive = profileAccountSearchActive(
                    row,
                    accountResolved
                  );
                  const excludeForRow = [
                    ...(accountId ? [accountId] : []),
                    ...knownGrantIds,
                    ...rows
                      .map((entry, rowIndex) =>
                        rowIndex === index
                          ? null
                          : normalizeNearAccountId(entry)
                      )
                      .filter((id): id is string => Boolean(id?.trim())),
                  ];
                  return (
                    <StorageShareRecipientRow
                      key={`${baseId}-${index}`}
                      rowId={String(index)}
                      idPrefix="guild-storage-recipient"
                      label="Member account"
                      value={row}
                      status={status}
                      allocationBytes={
                        status === 'ready' && bytesPerRecipient > 0
                          ? bytesPerRecipient
                          : null
                      }
                      canRemove={rows.length > 1}
                      disabled={pending}
                      removeAriaLabel="Remove member"
                      issueCopy={GUILD_RECIPIENT_ISSUE}
                      below={
                        searchActive ? (
                          <div className="hub-transfer-search">
                            <ProfileAccountSearchPicks
                              query={row}
                              excludeAccountIds={excludeForRow}
                              includeAccountIds={rosterAccountIds}
                              enabled={!pending && rosterAccountIds.length > 0}
                              disabled={pending}
                              viewerAccountId={accountId}
                              emptyHint="No members match."
                              listAriaLabel="Guild members"
                              onPick={(memberId) =>
                                setRows((current) =>
                                  current.map((entry, rowIndex) =>
                                    rowIndex === index ? memberId : entry
                                  )
                                )
                              }
                            />
                          </div>
                        ) : null
                      }
                      onValueChange={(value) =>
                        setRows((current) =>
                          current.map((entry, rowIndex) =>
                            rowIndex === index ? value : entry
                          )
                        )
                      }
                      onRemove={() =>
                        setRows((current) =>
                          current.length <= 1
                            ? current
                            : current.filter(
                                (_, rowIndex) => rowIndex !== index
                              )
                        )
                      }
                    />
                  );
                })}
              </div>

              <div className="app-storage-share-split-controls">
                <div
                  className="app-storage-presets"
                  role="group"
                  aria-label="Guild storage percent"
                >
                  {STORAGE_SHARE_PERCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`os-surface-chip${
                        sharePercent === preset ? ' is-selected' : ''
                      }`}
                      onClick={() => setSharePercent(preset)}
                      disabled={pending}
                    >
                      {preset === 100 ? 'Max' : `${preset}%`}
                    </button>
                  ))}
                </div>
                <StorageShareSplitVisual
                  sharePercent={sharePercent}
                  readyCount={readyRecipients.length}
                  bytesPerRecipient={bytesPerRecipient}
                  totalShareBytes={totalShareBytes}
                  needsFunding={needsFunding}
                  recipientNoun="members"
                  emptyHint="Choose members to preview the split."
                />
              </div>

              {error ? (
                <p className="app-storage-error" role="alert">
                  {error}
                </p>
              ) : null}

              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                <OsSheetAction
                  type="button"
                  ready={!pending && canGrant && !error}
                  pending={pending}
                  pendingLabel="Adding…"
                  disabled={pending || !canGrant}
                  onClick={() => void handleGrant()}
                >
                  {readyRecipients.length > 1
                    ? `Add storage · ${readyRecipients.length}`
                    : 'Add storage'}
                </OsSheetAction>
              </OsSheetActions>
              <p className="app-storage-hint app-storage-hint--compact">
                {GUILD_STORAGE_GRANT_HINT}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </OsHugSheet>
  );
}
