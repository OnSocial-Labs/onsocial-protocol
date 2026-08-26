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
  getProtocolRoleMemberOptions,
  isProtocolCreateMembershipKind,
  protocolCreateComposeKindHint,
  protocolCreateKindHint,
  protocolCreateKindLabel,
  type ProtocolCreateKind,
  type ProtocolProposalPayload,
} from '@/features/protocol/protocol-create';
import { ProtocolComposeChangeTypeRow } from '@/features/protocol/protocol-compose-change-type-row';
import {
  isProtocolNearAccountFieldReady,
  ProtocolComposeNearAccountField,
} from '@/features/protocol/protocol-compose-near-account-field';
import {
  isProtocolRemoveMemberReady,
  ProtocolComposeRemoveMemberField,
} from '@/features/protocol/protocol-compose-remove-member-field';
import { createDefaultProtocolSeasonConfigDraft } from '@/features/protocol/protocol-season-config';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import {
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import {
  getProtocolCreateKindBlockReason,
  viewerHasCreateKindPermission,
} from '@/features/protocol/protocol-propose-gate';
import { ProtocolComposeFundSeasonFields } from '@/features/protocol/protocol-compose-fund-season-fields';
import { ProtocolComposeTransferFields } from '@/features/protocol/protocol-compose-transfer-fields';
import { ProtocolComposeWithdrawBoostFields } from '@/features/protocol/protocol-compose-withdraw-boost-fields';
import {
  protocolCreateBoostWithdrawReady,
  protocolCreateBoundedSocialAmountReady,
  protocolCreateDescriptionReady,
  protocolCreateWhisper,
} from '@/features/protocol/protocol-create-compose';
import {
  protocolCreateTransferReady,
  resolveProtocolTransferAmountYocto,
  resolveProtocolTransferAsset,
} from '@/features/protocol/protocol-transfer-compose';
import { ProtocolComposeContractConfigFields } from '@/features/protocol/protocol-compose-contract-config-fields';
import { ProtocolComposeDescriptionField } from '@/features/protocol/protocol-compose-description-field';
import { ProtocolCreateRoleRow } from '@/features/protocol/protocol-create-role-row';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { ProtocolTaskSheet } from '@/features/protocol/protocol-task-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';
import type { ProtocolDaoBoostInfraContext } from '@/lib/protocol-dao-boost-infra';
import type { ProtocolDaoManagedContract } from '@/lib/protocol-dao-managed-contracts';
import type { ProtocolDaoSocialSpendTreasuryContext } from '@/lib/protocol-dao-social-spend-treasury';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { normalizeNearAccountId } from '@/lib/app-near-account';
import { normalizeBoundedNote } from '@/lib/bounded-note-field';
import { useNearAccountStatus } from '@/hooks/use-near-account-status';
import {
  formatSocialCompact,
} from '@/lib/format-social-balance';
import { socialToYocto } from '@/lib/social-spend-profile';
import {
  PROTOCOL_CONFIRM_Z,
  PROTOCOL_NESTED_CHOICE_Z,
} from '@/features/protocol/protocol-sheet-z';

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
  const memberAccountFieldId = `${formId}-member-account`;
  const newOwnerFieldId = `${formId}-new-owner`;
  const descriptionFieldId = `${formId}-description`;
  const face = useMatchingDaoFaceEligibility(daoAccountId);
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
  const [fetchedEligibility, setFetchedEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const eligibility = face?.eligibility ?? fetchedEligibility;
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

  const removableMemberOptions = useMemo(
    () =>
      getProtocolRoleMemberOptions(daoPolicy, roleId, {
        excludeAccountId: accountId ?? '',
      }),
    [accountId, daoPolicy, roleId]
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
      setFetchedEligibility(null);
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
      setFetchedEligibility(null);
      setLoadState('ready');
      return;
    }
    if (face) {
      setFetchedEligibility(face.eligibility);
      setLoadState(
        face.isLoading && !face.eligibility ? 'loading' : 'ready'
      );
      return;
    }
    let cancelled = false;
    setLoadState('loading');
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setFetchedEligibility(next);
        setLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setFetchedEligibility(null);
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
    face,
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

  useEffect(() => {
    setDescription('');
  }, [kind]);

  useEffect(() => {
    if (!open || kind !== 'remove_member') return;
    setMemberId((current) => {
      const normalizedCurrent = normalizeNearAccountId(current);
      return (
        removableMemberOptions.find(
          (member) => normalizeNearAccountId(member) === normalizedCurrent
        ) ??
        removableMemberOptions[0] ??
        ''
      );
    });
  }, [kind, open, removableMemberOptions, roleId]);

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
        setAuthorityId(context.treasuryDaoAccountId);
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
  const selectedTransferAsset = useMemo(
    () => resolveProtocolTransferAsset(transferAssets, transferTokenId),
    [transferAssets, transferTokenId]
  );
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
  const composeFieldsOwnLiveLoading =
    (kind === 'transfer' && transferAssetsLoading) ||
    (kind === 'fund_season_pool' && socialSpendLoading) ||
    ((kind === 'withdraw_boost_infra' ||
      kind === 'set_boost_infra_authority') &&
      boostInfraLoading);

  const eligibilityLoading =
    loadState === 'loading' || Boolean(face?.isLoading && !eligibility);
  const needsStake =
    !eligibilityLoading &&
    eligibility != null &&
    eligibility.hasStakeProposePath &&
    !viewerCanProposeOnDao(eligibility);
  const needsForeignStake =
    !eligibilityLoading &&
    eligibility != null &&
    Boolean(eligibility.foreignStakeTokenLabel) &&
    !viewerCanProposeOnDao(eligibility);
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

  const memberAccountStatus = useNearAccountStatus(
    kind === 'add_member' ? memberId : ''
  );
  const receiverAccountStatus = useNearAccountStatus(
    kind === 'transfer' ? receiverId : ''
  );
  const newOwnerAccountStatus = useNearAccountStatus(
    kind === 'transfer_ownership' ? newOwnerId : ''
  );
  const membershipFieldsReady = (() => {
    const isMembership =
      kind === 'join_self' ||
      kind === 'leave_self' ||
      kind === 'add_member' ||
      kind === 'remove_member';
    if (!isMembership) return true;
    if (!roleId.trim() || roles.length === 0) return false;
    if (kind === 'add_member') {
      return isProtocolNearAccountFieldReady(memberAccountStatus, memberId, {
        requireOnChain: true,
      });
    }
    if (kind === 'remove_member') {
      return isProtocolRemoveMemberReady(memberId, removableMemberOptions);
    }
    return true;
  })();
  const ownershipFieldsReady =
    kind !== 'transfer_ownership' ||
    (Boolean(contractId.trim()) &&
      isProtocolNearAccountFieldReady(newOwnerAccountStatus, newOwnerId, {
        requireOnChain: false,
      }));
  const boostWithdrawFieldsReady =
    kind !== 'withdraw_boost_infra' ||
    protocolCreateBoostWithdrawReady(amountSocial, {
      canWithdraw: Boolean(boostInfraContext?.canWithdrawBoostInfra),
      infraPoolYocto: boostInfraContext?.infraPoolYocto ?? '0',
    });
  const fundSeasonFieldsReady =
    kind !== 'fund_season_pool' ||
    (Boolean(seasonId.trim()) &&
      protocolCreateBoundedSocialAmountReady(
        amountSocial,
        socialSpendContext?.daoSocialBalanceYocto ?? '0'
      ));
  const transferFieldsReady =
    kind !== 'transfer' ||
    protocolCreateTransferReady(
      selectedTransferAsset,
      receiverAccountStatus,
      receiverId,
      amountNear
    );
  const descriptionReady = protocolCreateDescriptionReady(description);

  const formReady =
    Boolean(accountId) &&
    loadState === 'ready' &&
    hasKindPermission &&
    !liveContextLoading &&
    !liveContextBlock &&
    membershipFieldsReady &&
    ownershipFieldsReady &&
    boostWithdrawFieldsReady &&
    fundSeasonFieldsReady &&
    transferFieldsReady &&
    descriptionReady;

  const composeBondLabel =
    loadState === 'ready' && accountId && hasKindPermission && bondLabel
      ? bondLabel
      : null;
  const composeWhisper = useMemo(
    () => protocolCreateWhisper(kind, composeBondLabel),
    [composeBondLabel, kind]
  );

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!open) return null;
    return {
      visible: true,
      primaryLabel: 'Propose',
      primaryPendingLabel: 'Submitting…',
      canSubmit: !pending && formReady,
      pending,
      disabled: pending || !formReady,
      primaryType: 'submit',
    };
  }, [open, pending, formReady]);

  return (
    <>
    <ProtocolTaskSheet
      open={open}
      onClose={onClose}
      verb={protocolCreateKindLabel(kind)}
      handle={daoAccountId ?? undefined}
      whisper={composeWhisper}
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
              transferAmountYocto = resolveProtocolTransferAmountYocto(
                amountNear,
                selectedTransferAsset
              );
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
              description: normalizeBoundedNote(description),
              roleId,
              memberId: normalizeNearAccountId(memberId),
              receiverId:
                kind === 'withdraw_boost_infra'
                  ? boostInfraContext?.defaultReceiverId ?? TREASURY_DAO_ACCOUNT
                  : normalizeNearAccountId(receiverId),
              amountYocto:
                kind === 'transfer' ? transferAmountYocto : socialYocto,
              tokenId:
                kind === 'transfer' ? selectedTransferAsset?.tokenId : '',
              seasonId,
              seasonLabel,
              seasonActive,
              seasonDurationDays,
              contractId,
              newOwnerId: normalizeNearAccountId(newOwnerId),
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

        {needsForeignStake ? (
          <p className="protocol-compose-note is-warn">
            Need {eligibility?.foreignStakeTokenLabel ?? "this DAO's token"}{' '}
            stake to propose.
          </p>
        ) : null}

        {permissionBlock ? (
          <p className="protocol-compose-note is-warn">{permissionBlock}</p>
        ) : null}

        {liveContextLoading && !composeFieldsOwnLiveLoading ? (
          <p className="protocol-compose-note">Loading live DAO context…</p>
        ) : null}

        {liveContextBlock ? (
          <p className="protocol-compose-note is-warn">{liveContextBlock}</p>
        ) : null}

        {loadState === 'ready' &&
        accountId &&
        availableKinds.length === 0 ? (
          <p className="protocol-compose-note is-warn">
            No proposal kinds are available for your roles on this DAO.
          </p>
        ) : null}

        <div className="protocol-create-fields">
          {onChangeKind && !isProtocolCreateMembershipKind(kind) ? (
            <ProtocolComposeChangeTypeRow
              hint={
                protocolCreateComposeKindHint(kind) ||
                protocolCreateKindHint(kind)
              }
              pending={pending}
              onChangeKind={onChangeKind}
            />
          ) : null}

          <ProtocolCreateRoleRow
            kind={kind}
            roleId={roleId}
            roles={roles}
            pending={pending}
            zIndex={PROTOCOL_NESTED_CHOICE_Z}
            onChangeRole={setRoleId}
            onChangeKind={
              onChangeKind && isProtocolCreateMembershipKind(kind)
                ? onChangeKind
                : undefined
            }
          />

          {kind === 'add_member' ? (
            <ProtocolComposeNearAccountField
              id={memberAccountFieldId}
              label="Account"
              value={memberId}
              status={memberAccountStatus}
              onValueChange={(next) => {
                setMemberId(next);
                setFormError(null);
              }}
              disabled={pending}
              requireOnChain
            />
          ) : null}

          {kind === 'remove_member' ? (
            <ProtocolComposeRemoveMemberField
              roleId={roleId}
              memberId={memberId}
              options={removableMemberOptions}
              onMemberChange={(next) => {
                setMemberId(next);
                setFormError(null);
              }}
              disabled={pending}
              zIndex={PROTOCOL_NESTED_CHOICE_Z}
            />
          ) : null}

        {kind === 'transfer' ? (
          <ProtocolComposeTransferFields
            formId={formId}
            transferAssets={transferAssets}
            transferAssetsLoading={transferAssetsLoading}
            transferTokenId={transferTokenId}
            onTransferTokenChange={(next) => {
              setTransferTokenId(next);
              setAmountNear('');
              setFormError(null);
            }}
            receiverId={receiverId}
            receiverStatus={receiverAccountStatus}
            onReceiverChange={(next) => {
              setReceiverId(next);
              setFormError(null);
            }}
            amountInput={amountNear}
            onAmountChange={(next) => {
              setAmountNear(next);
              setFormError(null);
            }}
            pending={pending}
            zIndex={PROTOCOL_NESTED_CHOICE_Z}
          />
        ) : null}

        {kind === 'fund_season_pool' ? (
          <ProtocolComposeFundSeasonFields
            socialSpendContext={socialSpendContext}
            socialSpendLoading={socialSpendLoading}
            seasonId={seasonId}
            onSeasonIdChange={(next) => {
              setSeasonId(next);
              setFormError(null);
            }}
            amountSocial={amountSocial}
            onAmountChange={(next) => {
              setAmountSocial(next);
              setFormError(null);
            }}
            pending={pending}
            zIndex={PROTOCOL_NESTED_CHOICE_Z}
          />
        ) : null}

        {kind === 'withdraw_boost_infra' ? (
          <ProtocolComposeWithdrawBoostFields
            formId={formId}
            boostInfraContext={boostInfraContext}
            boostInfraLoading={boostInfraLoading}
            amountSocial={amountSocial}
            onAmountChange={(next) => {
              setAmountSocial(next);
              setFormError(null);
            }}
            pending={pending}
            blocked={Boolean(liveContextBlock)}
          />
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
              persistSelected
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
          <ProtocolComposeNearAccountField
            id={newOwnerFieldId}
            label="New owner"
            value={newOwnerId}
            status={newOwnerAccountStatus}
            onValueChange={(next) => {
              setNewOwnerId(next);
              setFormError(null);
            }}
            disabled={pending}
            requireOnChain={false}
          />
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
          <ProtocolComposeContractConfigFields
            configOpId={configOpId}
            onConfigOpChange={setConfigOpId}
            treasuryBps={treasuryBps}
            onTreasuryBpsChange={(next) => {
              setTreasuryBps(next);
              setFormError(null);
            }}
            seasonPoolBps={seasonPoolBps}
            onSeasonPoolBpsChange={(next) => {
              setSeasonPoolBps(next);
              setFormError(null);
            }}
            targetBps={targetBps}
            onTargetBpsChange={(next) => {
              setTargetBps(next);
              setFormError(null);
            }}
            burnBps={burnBps}
            onBurnBpsChange={(next) => {
              setBurnBps(next);
              setFormError(null);
            }}
            pending={pending}
            zIndex={PROTOCOL_NESTED_CHOICE_Z}
          />
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

        <ProtocolComposeDescriptionField
          id={descriptionFieldId}
          kind={kind}
          value={description}
          roleId={roleId}
          onValueChange={(next) => {
            setDescription(next);
            setFormError(null);
          }}
          disabled={pending}
        />
        </div>

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
      eligibilityLoading={eligibilityLoading}
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
