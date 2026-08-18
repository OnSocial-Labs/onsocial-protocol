'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  ChoiceDrawerField,
  osFieldBorderedClassName,
  type ChoiceOption,
} from '@onsocial/ui';
import type { CommerceSheetFooterState } from '@/features/scarces/commerce-sheet-footer';
import {
  fetchProtocolDaoBoostInfra,
  fetchProtocolDaoManagedContracts,
  fetchProtocolDaoSocialSpendTreasury,
  fetchProtocolDaoTransferAssets,
} from '@/features/protocol/protocol-dao-context-client';
import {
  PROTOCOL_CONTRACT_CONFIG_OPS,
  PROTOCOL_MANAGED_CONTRACTS,
  getProtocolUpgradableContracts,
  type ProtocolContractConfigOpId,
} from '@/features/protocol/protocol-contracts';
import {
  PROTOCOL_CREATE_KIND_OPTIONS,
  buildProtocolCreatePayload,
  getCreatableProtocolRoleOptions,
  protocolCreateKindLabel,
  type ProtocolCreateKind,
  type ProtocolProposalPayload,
} from '@/features/protocol/protocol-create';
import { createDefaultProtocolSeasonConfigDraft } from '@/features/protocol/protocol-season-config';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  getProtocolCreateKindBlockReason,
  isProtocolDaoGroupMember,
  viewerHasCreateKindPermission,
} from '@/features/protocol/protocol-propose-gate';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import type { ProtocolDaoBoostInfraContext } from '@/lib/protocol-dao-boost-infra';
import type { ProtocolDaoManagedContract } from '@/lib/protocol-dao-managed-contracts';
import type { ProtocolDaoSocialSpendTreasuryContext } from '@/lib/protocol-dao-social-spend-treasury';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { tokenAmountToSmallestUnit, yoctoToNear } from '@/lib/app-near-rpc';
import {
  formatSocialCompact,
  yoctoToSocial,
} from '@/lib/format-social-balance';
import { socialToYocto } from '@/lib/social-spend-profile';
import {
  PROTOCOL_CONFIRM_Z,
  PROTOCOL_NESTED_CHOICE_Z,
} from '@/features/protocol/protocol-sheet-z';

function tokenSmallestToDisplay(value: string, decimals: number): string {
  if (!value || value === '0') return '0';
  const safeDecimals = Math.max(0, Math.floor(decimals));
  if (safeDecimals === 0) return value.replace(/^0+/, '') || '0';
  const padded = value.padStart(safeDecimals + 1, '0');
  const whole = padded.slice(0, padded.length - safeDecimals) || '0';
  const fraction = padded
    .slice(padded.length - safeDecimals)
    .replace(/0+$/, '')
    .slice(0, 6);
  return fraction ? `${whole}.${fraction}` : whole;
}

function isGreaterThanBalance(amountSmallest: string, balanceSmallest: string) {
  try {
    return BigInt(amountSmallest || '0') > BigInt(balanceSmallest || '0');
  } catch {
    return true;
  }
}

export function ProtocolCreateSheet({
  open,
  onClose,
  daoAccountId,
  accountId,
  daoPolicy,
  pending,
  initialKind = 'signal',
  onSubmit,
  onOpenStake,
  onChangeKind,
}: {
  open: boolean;
  onClose: () => void;
  daoAccountId: string | null;
  accountId: string | null;
  daoPolicy: ProtocolDaoPolicy | null;
  pending: boolean;
  initialKind?: ProtocolCreateKind;
  onSubmit: (payload: ProtocolProposalPayload) => void;
  onOpenStake: () => void;
  /** Optional — reopen the kind picker without losing the form sheet chrome. */
  onChangeKind?: () => void;
}) {
  const formId = useId();
  const staticUpgradable = useMemo(() => getProtocolUpgradableContracts(), []);
  const defaultSeasonConfigDraft = useMemo(
    () => createDefaultProtocolSeasonConfigDraft(),
    []
  );
  const [kind, setKind] = useState<ProtocolCreateKind>(initialKind);
  const [description, setDescription] = useState('');
  const [roleId, setRoleId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amountNear, setAmountNear] = useState('');
  const [amountSocial, setAmountSocial] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [seasonLabel, setSeasonLabel] = useState(
    defaultSeasonConfigDraft.label
  );
  const [seasonActive, setSeasonActive] = useState(
    defaultSeasonConfigDraft.active
  );
  const [seasonDurationDays, setSeasonDurationDays] = useState(
    defaultSeasonConfigDraft.durationDays
  );
  const [contractId, setContractId] = useState(
    PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? ''
  );
  const [newOwnerId, setNewOwnerId] = useState('');
  const [codeHash, setCodeHash] = useState('');
  const [authorityId, setAuthorityId] = useState(TREASURY_DAO_ACCOUNT);
  const [configOpId, setConfigOpId] =
    useState<ProtocolContractConfigOpId>('support_profile');
  const [treasuryBps, setTreasuryBps] = useState('100');
  const [seasonPoolBps, setSeasonPoolBps] = useState('0');
  const [targetBps, setTargetBps] = useState('9900');
  const [burnBps, setBurnBps] = useState('0');
  const [transferAssets, setTransferAssets] = useState<
    ProtocolDaoTransferAsset[]
  >([]);
  const [transferTokenId, setTransferTokenId] = useState('');
  const [transferAssetsLoading, setTransferAssetsLoading] = useState(false);
  const [socialSpendContext, setSocialSpendContext] =
    useState<ProtocolDaoSocialSpendTreasuryContext | null>(null);
  const [socialSpendLoading, setSocialSpendLoading] = useState(false);
  const [boostInfraContext, setBoostInfraContext] =
    useState<ProtocolDaoBoostInfraContext | null>(null);
  const [boostInfraLoading, setBoostInfraLoading] = useState(false);
  const [managedContracts, setManagedContracts] = useState<
    ProtocolDaoManagedContract[]
  >([]);
  const [managedContractsLoading, setManagedContractsLoading] = useState(false);
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] =
    useState<ProtocolProposalPayload | null>(null);

  const roles = useMemo(
    () => getCreatableProtocolRoleOptions(daoPolicy),
    [daoPolicy]
  );
  const isGroupMember = useMemo(
    () => isProtocolDaoGroupMember(daoPolicy, accountId),
    [daoPolicy, accountId]
  );
  const availableKinds = useMemo(() => {
    if (!accountId || loadState !== 'ready') {
      return PROTOCOL_CREATE_KIND_OPTIONS;
    }
    return PROTOCOL_CREATE_KIND_OPTIONS.filter((option) =>
      viewerHasCreateKindPermission(daoPolicy, accountId, option.id)
    );
  }, [accountId, loadState, daoPolicy]);

  const hasKindPermission = useMemo(
    () => viewerHasCreateKindPermission(daoPolicy, accountId, kind),
    [daoPolicy, accountId, kind]
  );

  useEffect(() => {
    if (!open) {
      setKind(initialKind);
      setDescription('');
      setRoleId('');
      setMemberId('');
      setReceiverId('');
      setAmountNear('');
      setAmountSocial('');
      setSeasonId('');
      setSeasonLabel(defaultSeasonConfigDraft.label);
      setSeasonActive(defaultSeasonConfigDraft.active);
      setSeasonDurationDays(defaultSeasonConfigDraft.durationDays);
      setContractId(PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? '');
      setNewOwnerId('');
      setCodeHash('');
      setAuthorityId(TREASURY_DAO_ACCOUNT);
      setConfigOpId('support_profile');
      setTreasuryBps('100');
      setSeasonPoolBps('0');
      setTargetBps('9900');
      setBurnBps('0');
      setTransferAssets([]);
      setTransferTokenId('');
      setTransferAssetsLoading(false);
      setSocialSpendContext(null);
      setSocialSpendLoading(false);
      setBoostInfraContext(null);
      setBoostInfraLoading(false);
      setManagedContracts([]);
      setManagedContractsLoading(false);
      setEligibility(null);
      setLoadState('idle');
      setFormError(null);
      setProposeConfirmOpen(false);
      setPendingPayload(null);
      return;
    }

    setKind(initialKind);
    if (initialKind === 'contract_upgrade') {
      setContractId(staticUpgradable[0]?.contractId ?? '');
    }
    if (initialKind === 'transfer_ownership') {
      setContractId(PROTOCOL_MANAGED_CONTRACTS[0]?.contractId ?? '');
    }
    if (initialKind === 'season_config') {
      setSeasonId(defaultSeasonConfigDraft.seasonId);
      setSeasonLabel(defaultSeasonConfigDraft.label);
    }

    if (!daoAccountId || !accountId) {
      setEligibility(null);
      setLoadState('ready');
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setEligibility(next);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setEligibility(null);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    daoAccountId,
    accountId,
    defaultSeasonConfigDraft,
    initialKind,
    staticUpgradable,
  ]);

  useEffect(() => {
    if (!open) return;
    if (roles.length === 0) {
      setRoleId('');
      return;
    }
    setRoleId((current) =>
      current && roles.includes(current) ? current : roles[0]!
    );
  }, [open, roles]);

  // Kind is chosen in ProtocolProposeKindSheet — only fall back if the
  // selected kind is no longer permissioned for this viewer.
  useEffect(() => {
    if (!open || availableKinds.length === 0) return;
    setKind((current) =>
      availableKinds.some((option) => option.id === current)
        ? current
        : availableKinds[0]!.id
    );
  }, [open, availableKinds]);

  useEffect(() => {
    const op = PROTOCOL_CONTRACT_CONFIG_OPS.find(
      (entry) => entry.id === configOpId
    );
    if (!op) return;
    setTreasuryBps(String(op.defaults.treasuryBps));
    setSeasonPoolBps(String(op.defaults.seasonPoolBps));
    setTargetBps(String(op.defaults.targetBps));
    setBurnBps(String(op.defaults.burnBps));
  }, [configOpId]);

  useEffect(() => {
    if (!open || !daoAccountId || kind !== 'transfer') {
      return;
    }

    let cancelled = false;
    setTransferAssetsLoading(true);
    void fetchProtocolDaoTransferAssets(daoAccountId)
      .then((assets) => {
        if (cancelled) return;
        setTransferAssets(assets);
        setTransferTokenId((current) =>
          assets.some((asset) => asset.tokenId === current)
            ? current
            : (assets[0]?.tokenId ?? '')
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTransferAssets([]);
        setTransferTokenId('');
      })
      .finally(() => {
        if (!cancelled) setTransferAssetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, kind]);

  useEffect(() => {
    if (!open || !daoAccountId || kind !== 'fund_season_pool') {
      return;
    }

    let cancelled = false;
    setSocialSpendLoading(true);
    void fetchProtocolDaoSocialSpendTreasury(daoAccountId)
      .then((context) => {
        if (cancelled) return;
        setSocialSpendContext(context);
        if (context?.fundableSeasonIds.length) {
          setSeasonId((current) =>
            context.fundableSeasonIds.includes(current)
              ? current
              : (context.fundableSeasonIds[0] ?? '')
          );
        }
      })
      .catch(() => {
        if (!cancelled) setSocialSpendContext(null);
      })
      .finally(() => {
        if (!cancelled) setSocialSpendLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, kind]);

  useEffect(() => {
    if (
      !open ||
      !daoAccountId ||
      (kind !== 'withdraw_boost_infra' && kind !== 'set_boost_infra_authority')
    ) {
      return;
    }

    let cancelled = false;
    setBoostInfraLoading(true);
    void fetchProtocolDaoBoostInfra(daoAccountId)
      .then((context) => {
        if (cancelled) return;
        setBoostInfraContext(context);
        if (!context) return;
        setReceiverId((current) => current || context.defaultReceiverId);
        setAuthorityId(context.treasuryDaoAccountId);
        if (kind === 'withdraw_boost_infra') {
          setAmountSocial(yoctoToSocial(context.infraPoolYocto));
        }
      })
      .catch(() => {
        if (!cancelled) setBoostInfraContext(null);
      })
      .finally(() => {
        if (!cancelled) setBoostInfraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, kind]);

  useEffect(() => {
    if (
      !open ||
      !daoAccountId ||
      (kind !== 'transfer_ownership' && kind !== 'contract_upgrade')
    ) {
      return;
    }

    let cancelled = false;
    setManagedContractsLoading(true);
    void fetchProtocolDaoManagedContracts(daoAccountId)
      .then((contracts) => {
        if (cancelled) return;
        setManagedContracts(contracts);
        const options =
          contracts.length > 0
            ? kind === 'contract_upgrade'
              ? contracts.filter((contract) => contract.upgradable)
              : contracts
            : kind === 'contract_upgrade'
              ? staticUpgradable
              : PROTOCOL_MANAGED_CONTRACTS;
        setContractId((current) =>
          options.some((contract) => contract.contractId === current)
            ? current
            : (options[0]?.contractId ?? '')
        );
      })
      .catch(() => {
        if (!cancelled) setManagedContracts([]);
      })
      .finally(() => {
        if (!cancelled) setManagedContractsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId, kind, staticUpgradable]);

  const managedContractOptions =
    managedContracts.length > 0 ? managedContracts : PROTOCOL_MANAGED_CONTRACTS;
  const upgradableContractOptions =
    managedContracts.length > 0
      ? managedContracts.filter((contract) => contract.upgradable)
      : staticUpgradable;
  const selectedTransferAsset =
    transferAssets.find((asset) => asset.tokenId === transferTokenId) ??
    transferAssets[0] ??
    null;
  const liveContextLoading =
    (kind === 'transfer' && transferAssetsLoading) ||
    (kind === 'fund_season_pool' && socialSpendLoading) ||
    ((kind === 'withdraw_boost_infra' ||
      kind === 'set_boost_infra_authority') &&
      boostInfraLoading) ||
    ((kind === 'transfer_ownership' || kind === 'contract_upgrade') &&
      managedContractsLoading);
  const liveContextBlock =
    kind === 'withdraw_boost_infra' &&
    boostInfraContext &&
    !boostInfraContext.canWithdrawBoostInfra
      ? 'This DAO is not the current boost infra withdraw authority, or the infra pool is empty.'
      : kind === 'set_boost_infra_authority' &&
          boostInfraContext &&
          !boostInfraContext.canSetBoostInfraAuthority
        ? 'This DAO cannot update boost infra authority from the current contract state.'
        : null;

  const needsStake =
    loadState === 'ready' &&
    eligibility != null &&
    !isGroupMember &&
    !eligibility.canPropose;
  const bondLabel = eligibility?.proposalBond
    ? `${yoctoToNear(eligibility.proposalBond)} NEAR`
    : null;
  const shortfall =
    eligibility && BigInt(eligibility.remainingToThreshold) > 0n
      ? formatSocialCompact(eligibility.remainingToThreshold)
      : null;
  const permissionBlock =
    loadState === 'ready' && accountId && !hasKindPermission
      ? getProtocolCreateKindBlockReason(kind)
      : null;

  const formReady =
    Boolean(accountId) &&
    loadState === 'ready' &&
    hasKindPermission &&
    !liveContextLoading &&
    !liveContextBlock;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    return {
      visible: true,
      primaryLabel: 'Propose',
      primaryPendingLabel: 'Submitting…',
      canSubmit: !pending && formReady,
      pending,
      disabled:
        pending ||
        !accountId ||
        loadState === 'loading' ||
        loadState === 'error' ||
        liveContextLoading ||
        Boolean(liveContextBlock) ||
        !hasKindPermission,
      primaryType: 'submit',
    };
  }, [
    open,
    pending,
    formReady,
    accountId,
    loadState,
    liveContextLoading,
    liveContextBlock,
    hasKindPermission,
  ]);

  return (
    <>
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb={protocolCreateKindLabel(kind)}
      handle={daoAccountId ?? undefined}
      whisper="Fill the fields, then confirm bond and submit."
      closeAriaLabel="Close propose"
      backdropLabel="Close propose"
      formId={formId}
      footerState={footerState}
    >
      <form
        id={formId}
        className="protocol-compose protocol-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !accountId || !formReady) return;
          try {
            let transferAmountYocto = '';
            if (kind === 'transfer') {
              if (!selectedTransferAsset) {
                throw new Error('Choose an asset with a live DAO balance.');
              }
              transferAmountYocto = tokenAmountToSmallestUnit(
                amountNear.trim() || '0',
                selectedTransferAsset.decimals
              );
              if (
                isGreaterThanBalance(
                  transferAmountYocto,
                  selectedTransferAsset.balanceSmallest
                )
              ) {
                throw new Error(
                  `Amount exceeds the DAO ${selectedTransferAsset.symbol} balance.`
                );
              }
            }
            const socialYocto =
              kind === 'fund_season_pool' || kind === 'withdraw_boost_infra'
                ? socialToYocto(amountSocial.trim() || '0')
                : '';
            if (
              kind === 'fund_season_pool' &&
              socialSpendContext &&
              isGreaterThanBalance(
                socialYocto,
                socialSpendContext.daoSocialBalanceYocto
              )
            ) {
              throw new Error('Amount exceeds the DAO SOCIAL balance.');
            }
            if (
              kind === 'withdraw_boost_infra' &&
              boostInfraContext &&
              isGreaterThanBalance(
                socialYocto,
                boostInfraContext.infraPoolYocto
              )
            ) {
              throw new Error('Amount exceeds the boost infra pool.');
            }
            const payload = buildProtocolCreatePayload({
              kind,
              accountId,
              description,
              roleId,
              memberId,
              receiverId:
                kind === 'withdraw_boost_infra'
                  ? receiverId || TREASURY_DAO_ACCOUNT
                  : receiverId,
              amountYocto:
                kind === 'transfer' ? transferAmountYocto : socialYocto,
              tokenId:
                kind === 'transfer' ? selectedTransferAsset?.tokenId : '',
              seasonId,
              seasonLabel,
              seasonActive,
              seasonDurationDays,
              contractId,
              newOwnerId,
              codeHash,
              authorityId,
              configOpId,
              treasuryBps: Number(treasuryBps),
              seasonPoolBps: Number(seasonPoolBps),
              targetBps: Number(targetBps),
              burnBps: Number(burnBps),
            });
            setFormError(null);
            setPendingPayload(payload);
            setProposeConfirmOpen(true);
          } catch (error) {
            setFormError(
              error instanceof Error
                ? error.message
                : 'Could not build proposal.'
            );
          }
        }}
      >
        {!accountId ? (
          <p className="protocol-empty">Connect a wallet to propose.</p>
        ) : null}

        {accountId && loadState === 'loading' ? (
          <p className="protocol-empty">Checking proposal threshold…</p>
        ) : null}

        {accountId && loadState === 'error' ? (
          <p className="protocol-compose-note is-warn">
            Could not verify proposal eligibility. Close and try again.
          </p>
        ) : null}

        {needsStake ? (
          <p className="protocol-compose-note is-warn">
            Need {shortfall ?? 'more'} SOCIAL delegated — you can still fill
            this form; confirm will offer Stake
            {bondLabel ? ` · bond ${bondLabel}` : ''}.
          </p>
        ) : null}

        {permissionBlock ? (
          <p className="protocol-compose-note is-warn">{permissionBlock}</p>
        ) : null}

        {liveContextLoading ? (
          <p className="protocol-compose-note">Loading live DAO context…</p>
        ) : null}

        {liveContextBlock ? (
          <p className="protocol-compose-note is-warn">{liveContextBlock}</p>
        ) : null}

        {eligibility && hasKindPermission && !needsStake && bondLabel ? (
          <p className="protocol-compose-note">Bond {bondLabel} on submit.</p>
        ) : null}

        {loadState === 'ready' &&
        accountId &&
        availableKinds.length === 0 ? (
          <p className="protocol-compose-note is-warn">
            No proposal kinds are available for your roles on this DAO.
          </p>
        ) : null}

        {onChangeKind ? (
          <div className="protocol-propose-kind-current">
            <p className="protocol-compose-note">
              {
                PROTOCOL_CREATE_KIND_OPTIONS.find(
                  (option) => option.id === kind
                )?.hint
              }
            </p>
            <button
              type="button"
              className="protocol-tool is-ghost"
              onClick={onChangeKind}
              disabled={pending}
            >
              Change type
            </button>
          </div>
        ) : null}

        {(kind === 'join_self' ||
          kind === 'add_member' ||
          kind === 'leave_self' ||
          kind === 'remove_member') &&
          (roles.length === 0 ? (
            <p className="protocol-compose-note">No roles available.</p>
          ) : (
            <div className="guild-field">
              <ChoiceDrawerField
                label="Role"
                value={roleId}
                options={roles.map(
                  (role): ChoiceOption<string> => ({
                    value: role,
                    label: role,
                  })
                )}
                onChange={setRoleId}
                disabled={pending}
                copy="Group role for this membership proposal"
                zIndex={PROTOCOL_NESTED_CHOICE_Z}
              />
            </div>
          ))}

        {(kind === 'add_member' || kind === 'remove_member') && (
          <label className="guild-field">
            <span>Member account</span>
            <input
              type="text"
              value={memberId}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="alice.near"
              onChange={(event) => setMemberId(event.target.value)}
              disabled={pending}
              className={osFieldBorderedClassName}
            />
          </label>
        )}

        {kind === 'transfer' ? (
          <>
            {transferAssets.length === 0 ? (
              <p className="protocol-compose-note">
                {transferAssetsLoading ? 'Loading assets…' : 'No assets'}
              </p>
            ) : (
              <div className="guild-field">
                <ChoiceDrawerField
                  label="Asset"
                  value={selectedTransferAsset?.tokenId ?? transferTokenId}
                  options={transferAssets.map(
                    (asset): ChoiceOption<string> => ({
                      value: asset.tokenId,
                      label: asset.symbol,
                      description: `${tokenSmallestToDisplay(
                        asset.balanceSmallest,
                        asset.decimals
                      )} available`,
                    })
                  )}
                  onChange={(next) => {
                    setTransferTokenId(next);
                    setFormError(null);
                  }}
                  disabled={pending || transferAssetsLoading}
                  copy="Spendable balance held by this DAO"
                  zIndex={PROTOCOL_NESTED_CHOICE_Z}
                />
              </div>
            )}
            <label className="guild-field">
              <span>Recipient</span>
              <input
                type="text"
                value={receiverId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="alice.near"
                onChange={(event) => setReceiverId(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <label className="guild-field">
              <span>Amount ({selectedTransferAsset?.symbol ?? 'asset'})</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountNear}
                placeholder="0"
                onChange={(event) => setAmountNear(event.target.value)}
                disabled={pending || transferAssetsLoading}
                className={osFieldBorderedClassName}
              />
            </label>
            {selectedTransferAsset ? (
              <p className="protocol-compose-note">
                DAO balance{' '}
                {tokenSmallestToDisplay(
                  selectedTransferAsset.balanceSmallest,
                  selectedTransferAsset.decimals
                )}{' '}
                {selectedTransferAsset.symbol}
              </p>
            ) : null}
          </>
        ) : null}

        {kind === 'fund_season_pool' ? (
          <>
            {socialSpendContext?.fundableSeasonIds.length ? (
              <div className="guild-field">
                <ChoiceDrawerField
                  label="Season"
                  value={seasonId}
                  options={socialSpendContext.fundableSeasonIds.map(
                    (id): ChoiceOption<string> => ({
                      value: id,
                      label: id,
                    })
                  )}
                  onChange={setSeasonId}
                  disabled={pending || socialSpendLoading}
                  copy="Live rally seasons reported on-chain"
                  zIndex={PROTOCOL_NESTED_CHOICE_Z}
                />
              </div>
            ) : (
              <label className="guild-field">
                <span>Season id</span>
                <input
                  type="text"
                  value={seasonId}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="season2"
                  onChange={(event) => setSeasonId(event.target.value)}
                  disabled={pending || socialSpendLoading}
                  className={osFieldBorderedClassName}
                />
              </label>
            )}
            <label className="guild-field">
              <span>Amount (SOCIAL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountSocial}
                placeholder="0"
                onChange={(event) => setAmountSocial(event.target.value)}
                disabled={pending || socialSpendLoading}
                className={osFieldBorderedClassName}
              />
            </label>
            <p className="protocol-compose-note">
              DAO SOCIAL balance{' '}
              {formatSocialCompact(
                socialSpendContext?.daoSocialBalanceYocto ?? '0'
              )}{' '}
              SOCIAL
            </p>
            {socialSpendContext?.daoSocialBalanceYocto &&
            BigInt(socialSpendContext.daoSocialBalanceYocto) > 0n ? (
              <button
                type="button"
                className="protocol-tool is-ghost"
                onClick={() =>
                  setAmountSocial(
                    yoctoToSocial(socialSpendContext.daoSocialBalanceYocto)
                  )
                }
                disabled={pending || socialSpendLoading}
              >
                Use full balance
              </button>
            ) : null}
            {socialSpendContext &&
            socialSpendContext.fundableSeasonIds.length === 0 ? (
              <p className="protocol-compose-note is-warn">
                No live rally seasons were reported on-chain; enter an id
                manually if needed.
              </p>
            ) : null}
          </>
        ) : null}

        {kind === 'withdraw_boost_infra' ? (
          <>
            <label className="guild-field">
              <span>Amount (SOCIAL)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountSocial}
                placeholder="0"
                onChange={(event) => setAmountSocial(event.target.value)}
                disabled={
                  pending ||
                  boostInfraLoading ||
                  Boolean(
                    boostInfraContext &&
                      !boostInfraContext.canWithdrawBoostInfra
                  )
                }
                className={osFieldBorderedClassName}
              />
            </label>
            <label className="guild-field">
              <span>Receiver</span>
              <input
                type="text"
                value={receiverId || TREASURY_DAO_ACCOUNT}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setReceiverId(event.target.value)}
                disabled={pending || boostInfraLoading}
                className={osFieldBorderedClassName}
              />
            </label>
            {boostInfraContext ? (
              <p className="protocol-compose-note">
                Infra pool {yoctoToSocial(boostInfraContext.infraPoolYocto)}{' '}
                SOCIAL → {boostInfraContext.defaultReceiverId}
              </p>
            ) : null}
          </>
        ) : null}

        {kind === 'set_boost_infra_authority' ? (
          <>
            <label className="guild-field">
              <span>Authority</span>
              <input
                type="text"
                value={authorityId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setAuthorityId(event.target.value)}
                disabled={pending || boostInfraLoading}
                className={osFieldBorderedClassName}
              />
            </label>
            {boostInfraContext ? (
              <p className="protocol-compose-note">
                Current authority{' '}
                {boostInfraContext.infraWithdrawAuthority ?? 'not set'} ·
                recommended {boostInfraContext.treasuryDaoAccountId}
              </p>
            ) : null}
          </>
        ) : null}

        {kind === 'transfer_ownership' || kind === 'contract_upgrade' ? (
          <div className="guild-field">
            <ChoiceDrawerField
              label="Contract"
              value={contractId}
              options={(kind === 'contract_upgrade'
                ? upgradableContractOptions
                : managedContractOptions
              ).map(
                (entry): ChoiceOption<string> => ({
                  value: entry.contractId,
                  label: entry.label,
                  description: entry.contractId,
                })
              )}
              onChange={setContractId}
              disabled={pending || managedContractsLoading}
              copy={
                managedContracts.length > 0
                  ? 'Contracts currently owned by this DAO'
                  : 'Live ownership list unavailable; showing protocol defaults'
              }
              zIndex={PROTOCOL_NESTED_CHOICE_Z}
            />
          </div>
        ) : null}

        {kind === 'transfer_ownership' ? (
          <label className="guild-field">
            <span>New owner</span>
            <input
              type="text"
              value={newOwnerId}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="alice.near"
              onChange={(event) => setNewOwnerId(event.target.value)}
              disabled={pending}
              className={osFieldBorderedClassName}
            />
          </label>
        ) : null}

        {kind === 'contract_upgrade' ? (
          <label className="guild-field">
            <span>Published code hash</span>
            <input
              type="text"
              value={codeHash}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Near base58 hash"
              onChange={(event) => setCodeHash(event.target.value)}
              disabled={pending}
              className={osFieldBorderedClassName}
            />
          </label>
        ) : null}

        {kind === 'contract_config' ? (
          <>
            <div className="guild-field">
              <ChoiceDrawerField
                label="Setting"
                value={configOpId}
                options={PROTOCOL_CONTRACT_CONFIG_OPS.map(
                  (op): ChoiceOption<ProtocolContractConfigOpId> => ({
                    value: op.id,
                    label: op.label,
                  })
                )}
                onChange={setConfigOpId}
                disabled={pending}
                zIndex={PROTOCOL_NESTED_CHOICE_Z}
              />
            </div>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Treasury bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={treasuryBps}
                  onChange={(event) => setTreasuryBps(event.target.value)}
                  disabled={pending}
                  className={osFieldBorderedClassName}
                />
              </label>
              <label className="guild-field">
                <span>Season bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={seasonPoolBps}
                  onChange={(event) => setSeasonPoolBps(event.target.value)}
                  disabled={pending}
                  className={osFieldBorderedClassName}
                />
              </label>
            </div>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Target bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={targetBps}
                  onChange={(event) => setTargetBps(event.target.value)}
                  disabled={pending}
                  className={osFieldBorderedClassName}
                />
              </label>
              <label className="guild-field">
                <span>Burn bps</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={burnBps}
                  onChange={(event) => setBurnBps(event.target.value)}
                  disabled={pending}
                  className={osFieldBorderedClassName}
                />
              </label>
            </div>
          </>
        ) : null}

        {kind === 'season_config' ? (
          <>
            <label className="guild-field">
              <span>Season id</span>
              <input
                type="text"
                value={seasonId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="season-two"
                onChange={(event) => setSeasonId(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <label className="guild-field">
              <span>Label</span>
              <input
                type="text"
                value={seasonLabel}
                onChange={(event) => setSeasonLabel(event.target.value)}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </label>
            <div className="protocol-community-row">
              <label className="guild-field">
                <span>Duration days</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={seasonDurationDays}
                  onChange={(event) =>
                    setSeasonDurationDays(event.target.value)
                  }
                  disabled={pending}
                  className={osFieldBorderedClassName}
                />
              </label>
              <div className="guild-field">
                <ChoiceDrawerField
                  label="Status"
                  value={seasonActive ? 'true' : 'false'}
                  options={[
                    {
                      value: 'true' as const,
                      label: 'Active',
                    },
                    {
                      value: 'false' as const,
                      label: 'Paused',
                    },
                  ]}
                  onChange={(next) => setSeasonActive(next === 'true')}
                  disabled={pending}
                  zIndex={PROTOCOL_NESTED_CHOICE_Z}
                />
              </div>
            </div>
            <p className="protocol-compose-note">
              Starts about 10 minutes after submission; end time is derived from
              duration.
            </p>
          </>
        ) : null}

        <label className="guild-field">
          <span>{kind === 'signal' ? 'Signal' : 'Description'}</span>
          <textarea
            rows={kind === 'signal' ? 5 : 3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              kind === 'signal'
                ? 'What should the DAO decide?'
                : 'Optional rationale'
            }
            disabled={pending}
            className={osFieldBorderedClassName}
          />
        </label>

        {formError ? (
          <p className="protocol-compose-note is-warn">{formError}</p>
        ) : null}
      </form>
    </ProtocolTaskSheet>
    <DaoProposeConfirmSheet
      open={proposeConfirmOpen}
      title={`Propose ${protocolCreateKindLabel(kind)}?`}
      body="Submit this proposal to the DAO. It goes live after approval."
      eligibility={eligibility}
      eligibilityLoading={loadState === 'loading'}
      pending={pending}
      proposeLabel="Propose"
      zIndex={PROTOCOL_CONFIRM_Z}
      onDiscard={() => {
        setProposeConfirmOpen(false);
        setPendingPayload(null);
      }}
      onPropose={() => {
        if (!pendingPayload) return;
        onSubmit(pendingPayload);
      }}
      onStake={() => {
        setProposeConfirmOpen(false);
        setPendingPayload(null);
        onOpenStake();
      }}
    />
    </>
  );
}
