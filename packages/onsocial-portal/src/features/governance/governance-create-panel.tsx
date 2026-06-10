'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Settings2 } from 'lucide-react';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';
import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  CompactActionSkeleton,
  StatStripSkeleton,
} from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import {
  isNearAccountInputReady,
  NearAccountField,
  NearAccountPicker,
} from '@/components/ui/near-account-field';
import { useWallet } from '@/contexts/wallet-context';
import { useDropdown } from '@/hooks/use-dropdown';
import { fetchDaoPolicy, submitDaoProposal } from '@/features/governance/api';
import {
  buildDaoIdeaProposalPayload,
  buildDaoMemberProposalPayload,
  buildDaoFundSeasonPoolPayload,
  buildDaoTransferOwnershipProposalPayload,
  buildDaoTransferProposalPayload,
  buildDaoWithdrawSocialTreasuryPayload,
  FUND_SEASON_POOL_SOURCE_OPTIONS,
  type FundSeasonPoolSource,
  buildGovernanceCreateActionMenuItems,
  buildProtocolProposalAppId,
  canProposeDaoKind,
  canProposePolicyChange,
  DAO_SIGNAL_PROPOSAL_LABEL,
  DAO_SIGNAL_PROPOSAL_PLACEHOLDER,
  getCreatableDaoProposalActionOption,
  getCreatableDaoRoleOptions,
  getDaoGroupRoleMemberOptions,
  getDaoKindPermissionBlockReason,
  getProposalActionSubmitLabel,
  getProposalKindBlockReason,
  isDaoGroupMember,
  isProposalActionNomination,
  proposalActionToKind,
  resolveAvailablePolicyActionsForProposer,
  resolveCreatableProposalActionsForProposer,
  type CreatableDaoProposalAction,
  type GovernanceCreateActionMenuItem,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import {
  buildGovernancePathWithBoard,
  resolveGovernanceDaoBoard,
} from '@/features/governance/governance-dao-board';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useMemberAccountLookup } from '@/hooks/use-member-account-lookup';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';
import { getActiveSeasonId } from '@/lib/active-season';
import {
  getNearAccountInputError,
  normalizeNearAccountId,
} from '@/lib/portal-near-account';
import {
  formatSmallestTokenAmount,
  getGovernanceEligibility,
  getGovernanceProposalBond,
  isValidYoctoString,
  sanitizeTokenAmountInput,
  socialToYocto,
  tokenAmountToSmallestUnit,
  tryParseYoctoBigInt,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';
import {
  getBoundedNoteCounterClass,
  getBoundedNoteCounterLabel,
  getBoundedNoteError,
  isBoundedNoteReady,
  normalizeBoundedNote,
  PROPOSAL_DESCRIPTION_LIMITS,
} from '@/lib/bounded-note-field';

const descriptionFeedbackExit = { opacity: 0, transition: { duration: 0 } };
const descriptionFeedbackEnter = { opacity: 0, y: -4 };
const descriptionFeedbackAnimate = { opacity: 1, y: 0 };
const descriptionFeedbackTransition = {
  duration: 0.16,
  ease: 'easeOut' as const,
};

function formatSocial(value: string) {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatNear(value: string) {
  const numeric = Number(yoctoToNear(value));
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

const fieldLabelClass =
  'mb-2 block portal-type-label font-medium uppercase tracking-[0.16em] text-muted-foreground';

interface DaoTransferAssetOption {
  tokenId: string;
  symbol: string;
  name: string;
  icon: string | null;
  decimals: number;
  balanceSmallest: string;
}

interface DaoManagedContractOption {
  contractId: string;
  label: string;
  transferMethod: string;
  transferArgField: 'new_owner' | 'owner_id';
  gas: number;
  deposit: string;
}

interface DaoSocialSpendTreasuryContext {
  contractId: string;
  treasuryBalanceYocto: string;
  daoSocialBalanceYocto: string;
  treasuryId: string | null;
  ownerId: string | null;
  canWithdrawTreasury: boolean;
  canFundSeasonPool: boolean;
  canFundSeasonPoolFromDaoWallet: boolean;
  fundableSeasonIds: string[];
  allSeasonIds: string[];
}

export function GovernanceCreatePanel({
  daoAccountId = GOVERNANCE_DAO_ACCOUNT,
}: {
  daoAccountId?: string;
}) {
  const router = useRouter();
  const { accountId, connect, wallet, isConnected } = useWallet();
  const { txResult, clearTxResult, setTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const [proposalAction, setProposalAction] =
    useState<CreatableDaoProposalAction>('join_self');
  const [roleId, setRoleId] = useState('');
  const [nominatedAccountInput, setNominatedAccountInput] = useState('');
  const [transferReceiverInput, setTransferReceiverInput] = useState('');
  const [transferTokenId, setTransferTokenId] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [transferAssets, setTransferAssets] = useState<
    DaoTransferAssetOption[]
  >([]);
  const [transferAssetsLoading, setTransferAssetsLoading] = useState(false);
  const [transferOwnershipContractId, setTransferOwnershipContractId] =
    useState('');
  const [transferOwnershipNewOwnerInput, setTransferOwnershipNewOwnerInput] =
    useState('');
  const [managedContracts, setManagedContracts] = useState<
    DaoManagedContractOption[]
  >([]);
  const [managedContractsLoading, setManagedContractsLoading] = useState(false);
  const [socialSpendTreasuryContext, setSocialSpendTreasuryContext] =
    useState<DaoSocialSpendTreasuryContext | null>(null);
  const [socialSpendTreasuryLoading, setSocialSpendTreasuryLoading] =
    useState(false);
  const [socialSpendAmountInput, setSocialSpendAmountInput] = useState('');
  const [socialSpendSeasonId, setSocialSpendSeasonId] = useState('');
  const [fundSeasonPoolSource, setFundSeasonPoolSource] =
    useState<FundSeasonPoolSource>('contract_treasury');
  const [description, setDescription] = useState('');
  const [showDescriptionFeedback, setShowDescriptionFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] =
    useState<GovernanceEligibilitySnapshot | null>(null);
  const [proposalBond, setProposalBond] = useState('0');
  const [daoPolicy, setDaoPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [roleActiveIndex, setRoleActiveIndex] = useState(0);
  const roleTriggerRef = useRef<HTMLButtonElement>(null);
  const roleOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const {
    isOpen: roleMenuOpen,
    open: openRoleMenu,
    close: closeRoleMenu,
    toggle: toggleRoleMenu,
    containerRef: roleMenuContainerRef,
  } = useDropdown();
  const [actionActiveIndex, setActionActiveIndex] = useState(0);
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const actionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const {
    isOpen: actionMenuOpen,
    open: openActionMenu,
    close: closeActionMenu,
    toggle: toggleActionMenu,
    containerRef: actionMenuContainerRef,
  } = useDropdown();

  const proposalKind = proposalActionToKind(proposalAction);
  const isMembershipNomination = isProposalActionNomination(proposalAction);
  const isAddMemberAction = proposalAction === 'add_member';
  const isRemoveMemberAction = proposalAction === 'remove_member';
  const isTransferAction = proposalAction === 'transfer';
  const isTransferOwnershipAction = proposalAction === 'transfer_ownership';
  const isWithdrawSocialTreasuryAction =
    proposalAction === 'withdraw_social_treasury';
  const isFundSeasonPoolAction = proposalAction === 'fund_season_pool';
  const isSocialSpendTreasuryAction =
    isWithdrawSocialTreasuryAction || isFundSeasonPoolAction;
  const selectedRoleIndex = Math.max(
    0,
    roleOptions.findIndex((role) => role === roleId)
  );
  const showRoleDropdown = roleOptions.length > 1;

  const loadContext = useCallback(async () => {
    if (!accountId) {
      setEligibility(null);
      setDaoPolicy(null);
      setRoleOptions([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [nextEligibility, bond, policy] = await Promise.all([
        getGovernanceEligibility(accountId, daoAccountId),
        getGovernanceProposalBond(daoAccountId),
        fetchDaoPolicy(daoAccountId),
      ]);
      setEligibility(nextEligibility);
      setProposalBond(bond);
      setDaoPolicy(policy);
      const roles = getCreatableDaoRoleOptions(policy?.roles);
      setRoleOptions(roles);
      setRoleId((current) =>
        current && roles.includes(current) ? current : roles[0] || ''
      );
      setRoleActiveIndex(0);
    } catch {
      setEligibility(null);
      setDaoPolicy(null);
      setRoleOptions([]);
      setError('Could not load governance context.');
    } finally {
      setLoading(false);
    }
  }, [accountId, daoAccountId]);

  useEffect(() => {
    setEligibility(null);
    setError('');
    void loadContext();
  }, [accountId, daoAccountId, loadContext]);

  useEffect(() => {
    if (!isTransferAction) {
      return;
    }

    let cancelled = false;
    setTransferAssetsLoading(true);

    void fetch(
      `/api/governance/dao/assets?daoAccountId=${encodeURIComponent(daoAccountId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          assets?: DaoTransferAssetOption[];
        } | null;

        if (cancelled) {
          return;
        }

        const assets = payload?.assets ?? [];
        setTransferAssets(assets);
        setTransferTokenId((current) => {
          if (assets.some((asset) => asset.tokenId === current)) {
            return current;
          }
          return assets[0]?.tokenId ?? '';
        });
      })
      .catch(() => {
        if (!cancelled) {
          setTransferAssets([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTransferAssetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [daoAccountId, isTransferAction]);

  const selectedTransferAsset = useMemo(
    () =>
      transferAssets.find((asset) => asset.tokenId === transferTokenId) ??
      transferAssets[0] ??
      null,
    [transferAssets, transferTokenId]
  );

  const proposerAccountId = accountId ?? '';
  const baseAvailableProposalActions = useMemo(
    () =>
      resolveCreatableProposalActionsForProposer(
        daoPolicy,
        roleId,
        proposerAccountId,
        eligibility?.delegatedWeight ?? '0'
      ),
    [daoPolicy, eligibility?.delegatedWeight, proposerAccountId, roleId]
  );
  const canProposeTransferOwnership =
    baseAvailableProposalActions.includes('transfer_ownership');
  const canProposeSocialSpendTreasury =
    baseAvailableProposalActions.includes('withdraw_social_treasury') ||
    baseAvailableProposalActions.includes('fund_season_pool');

  useEffect(() => {
    if (!canProposeSocialSpendTreasury) {
      return;
    }

    let cancelled = false;
    setSocialSpendTreasuryLoading(true);

    void fetch(
      `/api/governance/dao/social-spend-treasury?daoAccountId=${encodeURIComponent(daoAccountId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          context?: DaoSocialSpendTreasuryContext | null;
        } | null;

        if (cancelled) {
          return;
        }

        const context = payload?.context ?? null;
        setSocialSpendTreasuryContext(context);
        if (context?.fundableSeasonIds.length) {
          setSocialSpendSeasonId((current) =>
            context.fundableSeasonIds.includes(current)
              ? current
              : context.fundableSeasonIds.includes(getActiveSeasonId())
                ? getActiveSeasonId()
                : (context.fundableSeasonIds[0] ?? '')
          );
        } else {
          setSocialSpendSeasonId('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSocialSpendTreasuryContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSocialSpendTreasuryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canProposeSocialSpendTreasury, daoAccountId]);

  useEffect(() => {
    if (!canProposeTransferOwnership) {
      return;
    }

    let cancelled = false;
    setManagedContractsLoading(true);

    void fetch(
      `/api/governance/dao/managed-contracts?daoAccountId=${encodeURIComponent(daoAccountId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          contracts?: DaoManagedContractOption[];
        } | null;

        if (cancelled) {
          return;
        }

        const contracts = payload?.contracts ?? [];
        setManagedContracts(contracts);
        setTransferOwnershipContractId((current) => {
          if (contracts.some((contract) => contract.contractId === current)) {
            return current;
          }
          return contracts[0]?.contractId ?? '';
        });
      })
      .catch(() => {
        if (!cancelled) {
          setManagedContracts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setManagedContractsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canProposeTransferOwnership, daoAccountId]);

  const availableProposalActions = useMemo(() => {
    let actions = baseAvailableProposalActions;

    if (
      actions.includes('transfer_ownership') &&
      managedContracts.length === 0
    ) {
      actions = actions.filter((action) => action !== 'transfer_ownership');
    }

    if (actions.includes('withdraw_social_treasury')) {
      if (!socialSpendTreasuryContext?.canWithdrawTreasury) {
        actions = actions.filter(
          (action) => action !== 'withdraw_social_treasury'
        );
      }
    }

    if (actions.includes('fund_season_pool')) {
      const canFund =
        socialSpendTreasuryContext?.canFundSeasonPool ||
        socialSpendTreasuryContext?.canFundSeasonPoolFromDaoWallet;
      if (!canFund) {
        actions = actions.filter((action) => action !== 'fund_season_pool');
      }
    }

    return actions;
  }, [
    baseAvailableProposalActions,
    managedContracts.length,
    socialSpendTreasuryContext?.canFundSeasonPool,
    socialSpendTreasuryContext?.canFundSeasonPoolFromDaoWallet,
    socialSpendTreasuryContext?.canWithdrawTreasury,
  ]);

  const selectedManagedContract = useMemo(
    () =>
      managedContracts.find(
        (contract) => contract.contractId === transferOwnershipContractId
      ) ??
      managedContracts[0] ??
      null,
    [managedContracts, transferOwnershipContractId]
  );

  const managedContractOptions = useMemo(
    () =>
      managedContracts.map((contract) => ({
        value: contract.contractId,
        label: contract.label,
        hint: contract.contractId,
      })),
    [managedContracts]
  );

  const subjectAccountId = useMemo(() => {
    if (proposalAction === 'idea') {
      return proposerAccountId;
    }
    if (isMembershipNomination) {
      return normalizeNearAccountId(nominatedAccountInput);
    }
    return proposerAccountId;
  }, [
    isMembershipNomination,
    nominatedAccountInput,
    proposalAction,
    proposerAccountId,
  ]);
  const subjectLookup = useMemberAccountLookup(subjectAccountId, {
    trustedAccount: true,
  });
  const isInitialLoading = loading && !eligibility;
  const thresholdDisplay = useMemo(() => {
    if (!eligibility) return '…';
    return formatSocial(eligibility.requiredWeight ?? '0');
  }, [eligibility]);
  const delegatedDisplay = useMemo(() => {
    if (!eligibility) return '…';
    return formatSocial(eligibility.delegatedWeight ?? '0');
  }, [eligibility]);
  const bondDisplay = formatNear(proposalBond);
  const canCoverBond =
    eligibility != null &&
    BigInt(eligibility.nearBalance) >= BigInt(proposalBond);
  const isMembershipProposal =
    proposalAction !== 'idea' &&
    proposalAction !== 'transfer' &&
    proposalAction !== 'transfer_ownership' &&
    !isSocialSpendTreasuryAction;
  const availablePolicyActions = useMemo(
    () =>
      resolveAvailablePolicyActionsForProposer(
        daoPolicy,
        proposerAccountId,
        eligibility?.delegatedWeight ?? '0'
      ),
    [daoPolicy, eligibility?.delegatedWeight, proposerAccountId]
  );
  const daoBoard = resolveGovernanceDaoBoard(daoAccountId);
  const policyPath = useMemo(
    () => buildGovernancePathWithBoard('/governance/policy', daoBoard),
    [daoBoard]
  );
  const actionMenuItems = useMemo(
    () =>
      buildGovernanceCreateActionMenuItems({
        availableProposalActions,
        availablePolicyActions,
        daoBoard,
      }),
    [availablePolicyActions, availableProposalActions, daoBoard]
  );
  const selectableProposalMenuItems = useMemo(
    () =>
      actionMenuItems.filter(
        (
          item
        ): item is Extract<
          GovernanceCreateActionMenuItem,
          { kind: 'proposal' }
        > => item.kind === 'proposal'
      ),
    [actionMenuItems]
  );
  const selectedActionOption =
    getCreatableDaoProposalActionOption(proposalAction);
  const selectedActionIndex = Math.max(
    0,
    selectableProposalMenuItems.findIndex(
      (option) => option.id === proposalAction
    )
  );
  const showActionDropdown =
    selectableProposalMenuItems.length + availablePolicyActions.length > 1;
  const removableMemberOptions = useMemo(
    () =>
      getDaoGroupRoleMemberOptions(daoPolicy, roleId, {
        excludeAccountId: proposerAccountId,
      }),
    [daoPolicy, proposerAccountId, roleId]
  );
  const membershipBlockReason = useMemo(
    () =>
      getProposalKindBlockReason(
        proposalKind,
        daoPolicy,
        roleId,
        subjectAccountId
      ),
    [daoPolicy, proposalKind, roleId, subjectAccountId]
  );
  const transferAmountSmallest = useMemo(() => {
    const normalized = transferAmountInput.trim();
    if (!normalized || !selectedTransferAsset) {
      return null;
    }

    try {
      const smallest = tokenAmountToSmallestUnit(
        normalized,
        selectedTransferAsset.decimals
      );
      return isValidYoctoString(smallest) ? smallest : null;
    } catch {
      return null;
    }
  }, [selectedTransferAsset, transferAmountInput]);
  const transferReceiverId = useMemo(
    () => normalizeNearAccountId(transferReceiverInput),
    [transferReceiverInput]
  );
  const transferExceedsBalance = useMemo(() => {
    if (!selectedTransferAsset || !transferAmountSmallest) {
      return false;
    }

    const amount = tryParseYoctoBigInt(transferAmountSmallest);
    const balance = tryParseYoctoBigInt(selectedTransferAsset.balanceSmallest);
    if (amount == null || balance == null) {
      return false;
    }

    return amount > balance;
  }, [selectedTransferAsset, transferAmountSmallest]);
  const transferReady =
    !!selectedTransferAsset &&
    isNearAccountInputReady(transferReceiverInput) &&
    transferAmountSmallest != null &&
    BigInt(transferAmountSmallest) > 0n &&
    !transferExceedsBalance;
  const transferOwnershipNewOwnerId = useMemo(
    () => normalizeNearAccountId(transferOwnershipNewOwnerInput),
    [transferOwnershipNewOwnerInput]
  );
  const socialSpendAmountYocto = useMemo(() => {
    const normalized = socialSpendAmountInput.trim();
    if (!normalized) {
      return null;
    }

    try {
      const yocto = socialToYocto(normalized);
      return isValidYoctoString(yocto) ? yocto : null;
    } catch {
      return null;
    }
  }, [socialSpendAmountInput]);
  const socialSpendTreasuryBalance = useMemo(
    () =>
      tryParseYoctoBigInt(
        socialSpendTreasuryContext?.treasuryBalanceYocto ?? '0'
      ),
    [socialSpendTreasuryContext?.treasuryBalanceYocto]
  );
  const daoSocialBalance = useMemo(
    () =>
      tryParseYoctoBigInt(
        socialSpendTreasuryContext?.daoSocialBalanceYocto ?? '0'
      ),
    [socialSpendTreasuryContext?.daoSocialBalanceYocto]
  );
  const fundSeasonPoolSourceOptions = useMemo(() => {
    return FUND_SEASON_POOL_SOURCE_OPTIONS.filter((option) => {
      if (option.value === 'contract_treasury') {
        return socialSpendTreasuryContext?.canFundSeasonPool ?? false;
      }
      return (
        socialSpendTreasuryContext?.canFundSeasonPoolFromDaoWallet ?? false
      );
    });
  }, [
    socialSpendTreasuryContext?.canFundSeasonPool,
    socialSpendTreasuryContext?.canFundSeasonPoolFromDaoWallet,
  ]);
  const activeFundSeasonPoolSource = fundSeasonPoolSourceOptions.some(
    (option) => option.value === fundSeasonPoolSource
  )
    ? fundSeasonPoolSource
    : (fundSeasonPoolSourceOptions[0]?.value ?? 'contract_treasury');
  const fundSeasonPoolSourceBalance = useMemo(() => {
    if (activeFundSeasonPoolSource === 'dao_wallet') {
      return daoSocialBalance;
    }
    return socialSpendTreasuryBalance;
  }, [
    activeFundSeasonPoolSource,
    daoSocialBalance,
    socialSpendTreasuryBalance,
  ]);
  const socialSpendAmountExceedsSource = useMemo(() => {
    if (!socialSpendAmountYocto || fundSeasonPoolSourceBalance == null) {
      return false;
    }

    try {
      return BigInt(socialSpendAmountYocto) > fundSeasonPoolSourceBalance;
    } catch {
      return false;
    }
  }, [fundSeasonPoolSourceBalance, socialSpendAmountYocto]);
  const socialSpendAmountExceedsTreasury = useMemo(() => {
    if (!socialSpendAmountYocto || socialSpendTreasuryBalance == null) {
      return false;
    }

    try {
      return BigInt(socialSpendAmountYocto) > socialSpendTreasuryBalance;
    } catch {
      return false;
    }
  }, [socialSpendAmountYocto, socialSpendTreasuryBalance]);
  const socialSpendSeasonOptions = useMemo(() => {
    const seasonIds = socialSpendTreasuryContext?.fundableSeasonIds ?? [];
    return seasonIds.map((seasonId) => ({
      value: seasonId,
      label: seasonId,
    }));
  }, [socialSpendTreasuryContext?.fundableSeasonIds]);
  const socialSpendTreasuryReady =
    !!socialSpendTreasuryContext &&
    socialSpendAmountYocto != null &&
    BigInt(socialSpendAmountYocto) > 0n &&
    (isWithdrawSocialTreasuryAction
      ? socialSpendTreasuryContext.canWithdrawTreasury &&
        !socialSpendAmountExceedsTreasury
      : isFundSeasonPoolAction
        ? (activeFundSeasonPoolSource === 'contract_treasury'
            ? socialSpendTreasuryContext.canFundSeasonPool
            : socialSpendTreasuryContext.canFundSeasonPoolFromDaoWallet) &&
          socialSpendSeasonId.trim().length > 0 &&
          socialSpendSeasonOptions.length > 0 &&
          !socialSpendAmountExceedsSource
        : false);
  const transferOwnershipReady =
    !!selectedManagedContract &&
    isNearAccountInputReady(transferOwnershipNewOwnerInput);
  const canProposeSelectedKind =
    !!eligibility &&
    !!proposerAccountId &&
    canProposeDaoKind(
      daoPolicy,
      proposerAccountId,
      eligibility.delegatedWeight,
      proposalKind
    );
  const subjectReady = useMemo(() => {
    if (isAddMemberAction) {
      return isNearAccountInputReady(nominatedAccountInput);
    }
    if (isRemoveMemberAction) {
      const normalizedSubject = normalizeNearAccountId(nominatedAccountInput);
      return removableMemberOptions.some(
        (member) => normalizeNearAccountId(member) === normalizedSubject
      );
    }
    return subjectLookup.exists;
  }, [
    isAddMemberAction,
    isRemoveMemberAction,
    nominatedAccountInput,
    removableMemberOptions,
    subjectLookup.exists,
  ]);
  const normalizedDescription = normalizeBoundedNote(description);
  const descriptionTextError = getBoundedNoteError(description);
  const descriptionLength = normalizedDescription.length;
  const hasDescription = descriptionLength > 0;
  const descriptionReady = isBoundedNoteReady(
    description,
    PROPOSAL_DESCRIPTION_LIMITS
  );
  const proposalActionAllowed =
    availableProposalActions.includes(proposalAction);
  const canSubmit =
    isConnected &&
    canCoverBond &&
    Boolean(proposerAccountId) &&
    canProposeSelectedKind &&
    (isTransferAction
      ? transferReady
      : isTransferOwnershipAction
        ? transferOwnershipReady
        : isSocialSpendTreasuryAction
          ? socialSpendTreasuryReady
          : isMembershipProposal
            ? roleId.trim().length > 0 && subjectReady
            : true) &&
    proposalActionAllowed &&
    descriptionReady &&
    !submitting;

  const blockedReason = useMemo(() => {
    if (!isConnected) return 'Connect your account to submit a proposal.';
    if (!eligibility) return '';
    if (!canCoverBond) {
      return `Add ${bondDisplay} NEAR to your account for the proposal bond.`;
    }
    if (isRemoveMemberAction && removableMemberOptions.length === 0) {
      return `No other members in ${roleId || 'this role'} to remove.`;
    }
    if (isMembershipProposal && membershipBlockReason) {
      return membershipBlockReason;
    }
    if (!descriptionReady) {
      if (!hasDescription) {
        return 'Add a description (at least 20 characters).';
      }
      if (descriptionTextError) {
        return descriptionTextError;
      }
    }
    if (proposerAccountId && !canProposeSelectedKind) {
      if (
        eligibility &&
        !eligibility.canPropose &&
        !isDaoGroupMember(daoPolicy, proposerAccountId)
      ) {
        return `Delegate ${formatSocial(eligibility.remainingToThreshold ?? '0')} more SOCIAL to reach the proposal threshold.`;
      }

      return getDaoKindPermissionBlockReason(proposalKind);
    }
    if (
      isTransferAction &&
      transferAmountInput.trim() &&
      !transferAmountSmallest
    ) {
      return `Enter a valid ${selectedTransferAsset?.symbol ?? 'token'} amount.`;
    }
    if (isTransferAction && transferExceedsBalance && selectedTransferAsset) {
      return `Amount exceeds DAO ${selectedTransferAsset.symbol} balance.`;
    }
    if (
      isTransferAction &&
      transferAssets.length === 0 &&
      !transferAssetsLoading
    ) {
      return 'This DAO has no transferable assets right now.';
    }
    if (isTransferAction && transferReceiverInput.trim()) {
      const accountError = getNearAccountInputError(transferReceiverInput);
      if (accountError) {
        return accountError;
      }
    }
    if (
      isTransferOwnershipAction &&
      managedContracts.length === 0 &&
      !managedContractsLoading
    ) {
      return 'This DAO does not own any supported protocol contracts right now.';
    }
    if (isTransferOwnershipAction && transferOwnershipNewOwnerInput.trim()) {
      const accountError = getNearAccountInputError(
        transferOwnershipNewOwnerInput
      );
      if (accountError) {
        return accountError;
      }
    }
    if (
      isSocialSpendTreasuryAction &&
      !socialSpendTreasuryLoading &&
      canProposeSocialSpendTreasury
    ) {
      if (
        isWithdrawSocialTreasuryAction &&
        !socialSpendTreasuryContext?.canWithdrawTreasury
      ) {
        return 'Sweep fees is available on the Treasury DAO board (?dao=treasury). Social-spend pays accrued fees to treasury_id.';
      }
      if (
        isFundSeasonPoolAction &&
        !socialSpendTreasuryContext?.canFundSeasonPool &&
        !socialSpendTreasuryContext?.canFundSeasonPoolFromDaoWallet
      ) {
        return 'Fund rally pool requires the DAO to own or receive social-spend treasury flows.';
      }
      if (
        isFundSeasonPoolAction &&
        socialSpendTreasuryContext?.canFundSeasonPool &&
        socialSpendSeasonOptions.length === 0
      ) {
        return 'No live rally season right now — funding opens when a season is active.';
      }
    }
    if (
      isSocialSpendTreasuryAction &&
      !socialSpendTreasuryContext &&
      !socialSpendTreasuryLoading
    ) {
      return 'Social-spend treasury actions are unavailable for this DAO.';
    }
    if (isSocialSpendTreasuryAction && socialSpendAmountInput.trim()) {
      if (!socialSpendAmountYocto) {
        return 'Enter a valid SOCIAL amount.';
      }
      if (isWithdrawSocialTreasuryAction && socialSpendAmountExceedsTreasury) {
        return 'Amount exceeds social-spend treasury balance.';
      }
      if (isFundSeasonPoolAction && socialSpendAmountExceedsSource) {
        return activeFundSeasonPoolSource === 'dao_wallet'
          ? 'Amount exceeds DAO SOCIAL balance.'
          : 'Amount exceeds social-spend fee pot balance.';
      }
    }
    if (isMembershipNomination && nominatedAccountInput.trim()) {
      const accountError = getNearAccountInputError(nominatedAccountInput);
      if (accountError) {
        return accountError;
      }
    }
    if (hasDescription && descriptionTextError) {
      return descriptionTextError;
    }
    return '';
  }, [
    bondDisplay,
    canCoverBond,
    canProposeSelectedKind,
    daoPolicy,
    descriptionReady,
    descriptionTextError,
    eligibility,
    hasDescription,
    isConnected,
    isMembershipNomination,
    isMembershipProposal,
    isRemoveMemberAction,
    isTransferAction,
    isTransferOwnershipAction,
    managedContracts.length,
    managedContractsLoading,
    membershipBlockReason,
    nominatedAccountInput,
    proposalKind,
    proposerAccountId,
    removableMemberOptions.length,
    roleId,
    selectedTransferAsset,
    transferAmountInput,
    transferAmountSmallest,
    transferAssets.length,
    transferAssetsLoading,
    transferExceedsBalance,
    transferOwnershipNewOwnerInput,
    transferReceiverInput,
    isFundSeasonPoolAction,
    isWithdrawSocialTreasuryAction,
    isSocialSpendTreasuryAction,
    activeFundSeasonPoolSource,
    socialSpendAmountExceedsSource,
    socialSpendAmountExceedsTreasury,
    canProposeSocialSpendTreasury,
    socialSpendTreasuryContext,
    socialSpendTreasuryLoading,
    socialSpendSeasonOptions.length,
    socialSpendAmountInput,
    socialSpendAmountYocto,
    daoBoard,
  ]);

  useEffect(() => {
    if (!isRemoveMemberAction) {
      return;
    }

    setNominatedAccountInput((current) => {
      const normalizedCurrent = normalizeNearAccountId(current);
      return (
        removableMemberOptions.find(
          (member) => normalizeNearAccountId(member) === normalizedCurrent
        ) ??
        removableMemberOptions[0] ??
        ''
      );
    });
  }, [isRemoveMemberAction, proposalAction, removableMemberOptions, roleId]);

  useEffect(() => {
    if (availableProposalActions.length === 0) {
      return;
    }

    if (!availableProposalActions.includes(proposalAction)) {
      if (
        proposalAction === 'transfer_ownership' &&
        managedContracts.length > 0 &&
        baseAvailableProposalActions.includes('transfer_ownership')
      ) {
        return;
      }

      const fallback =
        availableProposalActions.find((action) => action === 'idea') ??
        availableProposalActions[0];
      setProposalAction(fallback);
      setNominatedAccountInput('');
      setTransferReceiverInput('');
      setTransferTokenId('');
      setTransferAmountInput('');
      setTransferOwnershipContractId('');
      setTransferOwnershipNewOwnerInput('');
      setSocialSpendAmountInput('');
    }
  }, [
    availableProposalActions,
    baseAvailableProposalActions,
    managedContracts.length,
    proposalAction,
  ]);

  const handleSubmit = useCallback(async () => {
    if (!wallet || !accountId) {
      await connect();
      return;
    }

    const membershipReason = getProposalKindBlockReason(
      proposalKind,
      daoPolicy,
      roleId,
      subjectAccountId
    );
    const permissionReason =
      eligibility &&
      proposerAccountId &&
      !canProposeDaoKind(
        daoPolicy,
        proposerAccountId,
        eligibility.delegatedWeight,
        proposalKind
      )
        ? getDaoKindPermissionBlockReason(proposalKind)
        : '';

    if (permissionReason) {
      setError(permissionReason);
      return;
    }

    if (isMembershipProposal && membershipReason) {
      setError(membershipReason);
      return;
    }

    if (hasDescription && descriptionTextError) {
      setError(descriptionTextError);
      return;
    }

    if (!canSubmit) {
      setError(blockedReason || 'Complete the form before submitting.');
      return;
    }

    setError('');
    clearTxResult();
    setSubmitting(true);

    try {
      const payload =
        proposalKind === 'idea'
          ? buildDaoIdeaProposalPayload({
              description: normalizedDescription,
            })
          : proposalKind === 'transfer'
            ? buildDaoTransferProposalPayload({
                receiverId: transferReceiverId,
                amountYocto: transferAmountSmallest ?? '0',
                tokenId: selectedTransferAsset?.tokenId ?? '',
                tokenSymbol: selectedTransferAsset?.symbol,
                description: normalizedDescription,
              })
            : proposalKind === 'transfer_ownership'
              ? buildDaoTransferOwnershipProposalPayload({
                  contractId: selectedManagedContract?.contractId ?? '',
                  contractLabel: selectedManagedContract?.label,
                  newOwnerId: transferOwnershipNewOwnerId,
                  transferMethod:
                    selectedManagedContract?.transferMethod ?? 'set_owner',
                  transferArgField:
                    selectedManagedContract?.transferArgField ?? 'new_owner',
                  gas: selectedManagedContract?.gas ?? 100_000_000_000_000,
                  deposit: selectedManagedContract?.deposit ?? '0',
                  description: normalizedDescription,
                })
              : proposalKind === 'withdraw_social_treasury'
                ? buildDaoWithdrawSocialTreasuryPayload({
                    contractId: socialSpendTreasuryContext?.contractId ?? '',
                    amountYocto: socialSpendAmountYocto ?? '0',
                    description: normalizedDescription,
                  })
                : proposalKind === 'fund_season_pool'
                  ? buildDaoFundSeasonPoolPayload({
                      source: activeFundSeasonPoolSource,
                      contractId: socialSpendTreasuryContext?.contractId ?? '',
                      seasonId: socialSpendSeasonId,
                      amountYocto: socialSpendAmountYocto ?? '0',
                      description: normalizedDescription,
                    })
                  : buildDaoMemberProposalPayload({
                      kind: proposalKind,
                      memberId: subjectAccountId,
                      roleId,
                      description: normalizedDescription,
                    });

      const targetDaoAccountId = eligibility?.daoAccountId ?? daoAccountId;
      const { proposalId, txHash } = await submitDaoProposal(
        wallet,
        accountId,
        payload,
        targetDaoAccountId
      );

      if (!txHash) {
        throw new Error('Proposal returned no transaction hash.');
      }

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage: 'Submitting proposal…',
        successMessage: 'Proposal submitted.',
        failureMessage: 'Proposal submission failed.',
      });

      if (!confirmed) {
        return;
      }

      if (proposalId != null) {
        router.push(
          buildGovernancePathWithBoard(
            buildGovernanceProposalPath(
              buildProtocolProposalAppId(proposalId),
              proposalId
            ).split('?')[0] ?? '/governance',
            daoBoard,
            {
              proposal: String(proposalId),
            }
          )
        );
        return;
      }

      router.push(
        buildGovernancePathWithBoard('/governance', daoBoard, {
          lane: 'protocol',
        })
      );
    } catch (nextError) {
      setTxResult({
        type: 'error',
        msg:
          nextError instanceof Error
            ? nextError.message
            : 'Proposal submission failed.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    accountId,
    blockedReason,
    canSubmit,
    clearTxResult,
    connect,
    daoAccountId,
    daoBoard,
    daoPolicy,
    descriptionTextError,
    eligibility,
    normalizedDescription,
    isMembershipProposal,
    isTransferAction,
    isTransferOwnershipAction,
    isSocialSpendTreasuryAction,
    proposalKind,
    proposerAccountId,
    roleId,
    selectedManagedContract,
    selectedTransferAsset,
    socialSpendAmountYocto,
    socialSpendSeasonId,
    activeFundSeasonPoolSource,
    socialSpendTreasuryContext,
    subjectAccountId,
    transferAmountSmallest,
    transferOwnershipNewOwnerId,
    transferReceiverId,
    router,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const resolvedDaoAccountId = eligibility?.daoAccountId ?? daoAccountId;
  const showPolicySettings =
    !!eligibility &&
    canProposePolicyChange(
      daoPolicy,
      accountId ?? '',
      eligibility.delegatedWeight
    );

  const openRoleDropdown = (index = selectedRoleIndex) => {
    setRoleActiveIndex(index >= 0 ? index : 0);
    openRoleMenu();
  };

  const closeRoleDropdown = () => {
    closeRoleMenu();
    roleTriggerRef.current?.focus();
  };

  const selectRoleAtIndex = (index: number) => {
    const nextRole = roleOptions[index];
    if (!nextRole) {
      return;
    }

    setRoleId(nextRole);
    setRoleActiveIndex(index);
    setError('');
    closeRoleDropdown();
  };

  const openActionDropdown = (index = selectedActionIndex) => {
    setActionActiveIndex(index >= 0 ? index : 0);
    openActionMenu();
  };

  const closeActionDropdown = () => {
    closeActionMenu();
    actionTriggerRef.current?.focus();
  };

  const selectActionAtIndex = (index: number) => {
    const nextAction = selectableProposalMenuItems[index];
    if (!nextAction) {
      return;
    }

    setProposalAction(nextAction.id);
    setActionActiveIndex(index);
    setNominatedAccountInput('');
    setTransferReceiverInput('');
    setTransferTokenId(transferAssets[0]?.tokenId ?? '');
    setTransferAmountInput('');
    setTransferOwnershipContractId(managedContracts[0]?.contractId ?? '');
    setTransferOwnershipNewOwnerInput('');
    setError('');
    closeActionDropdown();
  };

  const transferAssetOptions = useMemo(
    () =>
      transferAssets.map((asset) => ({
        value: asset.tokenId,
        label: asset.symbol,
        hint: `${formatSmallestTokenAmount(asset.balanceSmallest, asset.decimals, 6)} ${asset.symbol} available`,
      })),
    [transferAssets]
  );

  useEffect(() => {
    if (!roleMenuOpen) {
      return;
    }

    roleOptionRefs.current[roleActiveIndex]?.focus();
  }, [roleActiveIndex, roleMenuOpen]);

  useEffect(() => {
    if (!actionMenuOpen) {
      return;
    }

    actionOptionRefs.current[actionActiveIndex]?.focus();
  }, [actionActiveIndex, actionMenuOpen]);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel tone="soft" className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl min-w-0">
            <SectionHeader
              badge="Create"
              className="mb-0"
              contentClassName="max-w-2xl"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${resolvedDaoAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono portal-blue-text transition-colors hover:text-[var(--portal-blue)]"
              >
                @{resolvedDaoAccountId}
              </a>
            </p>
          </div>
          {accountId ? (
            <div className="flex shrink-0 items-center gap-2">
              {showPolicySettings ? (
                <PortalHoverTooltip tooltip="DAO policy">
                  <Button
                    asChild
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <Link href={policyPath} aria-label="Open DAO policy">
                      <Settings2 className="h-4 w-4" />
                    </Link>
                  </Button>
                </PortalHoverTooltip>
              ) : null}
              <PortalHoverTooltip
                tooltip={loading ? 'Refreshing context' : 'Refresh context'}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    void loadContext();
                  }}
                  disabled={loading}
                  aria-label="Refresh governance context"
                  className="h-8 w-8 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                  />
                </Button>
              </PortalHoverTooltip>
            </div>
          ) : null}
        </div>

        {!accountId ? (
          <div className="mt-3 border-t border-fade-detail pt-3">
            <p className="text-sm text-muted-foreground">
              Connect your account to continue.
            </p>
            <Button
              type="button"
              className="mt-3 h-11"
              onClick={() => {
                void connect();
              }}
            >
              Connect account
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl border-t border-fade-detail pt-3">
            <StatStripSkeleton
              items={3}
              columns={3}
              groupClassName="mt-0"
              showTopDivider={false}
            />
            <CompactActionSkeleton className="mt-3 pt-3" tabCount={3} />
          </div>
        ) : (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl">
            <StatStrip columns={3} groupClassName="mt-0">
              <StatStripCell
                label="Delegated"
                value={`${delegatedDisplay} SOCIAL`}
                showDivider
                size="sm"
                valueClassName={
                  eligibility?.canPropose || canProposeSelectedKind
                    ? 'portal-green-text'
                    : 'portal-blue-text'
                }
              />
              <StatStripCell
                label="Threshold"
                value={`${thresholdDisplay} SOCIAL`}
                showDivider
                size="sm"
              />
              <StatStripCell
                label="Bond"
                value={`${bondDisplay} NEAR`}
                size="sm"
              />
            </StatStrip>

            {!eligibility?.canPropose && !canProposeSelectedKind ? (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
                <Link
                  href="/governance/manage"
                  className="portal-action-link group inline-flex items-center gap-1 font-medium"
                >
                  Position
                  <ProtocolMotionArrow className="h-3 w-3" />
                </Link>
              </div>
            ) : null}

            <div className="mt-3 space-y-3">
              <div>
                <label
                  htmlFor={
                    showActionDropdown ? 'governance-create-action' : undefined
                  }
                  className={fieldLabelClass}
                >
                  Action
                </label>
                {selectableProposalMenuItems.length === 0 ? (
                  <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
                    {availablePolicyActions.length > 0 ? (
                      <p>
                        No public proposal actions here. Open{' '}
                        <Link
                          href={policyPath}
                          className="portal-action-link font-medium"
                        >
                          DAO policy
                        </Link>{' '}
                        to change permissions or parameters.
                      </p>
                    ) : (
                      'No proposal actions available for your account on this DAO yet.'
                    )}
                  </div>
                ) : showActionDropdown ? (
                  <div className="relative" ref={actionMenuContainerRef}>
                    <button
                      ref={actionTriggerRef}
                      id="governance-create-action"
                      type="button"
                      onClick={toggleActionMenu}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          openActionDropdown(
                            Math.min(
                              selectedActionIndex + 1,
                              selectableProposalMenuItems.length - 1
                            )
                          );
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          openActionDropdown(
                            Math.max(selectedActionIndex - 1, 0)
                          );
                        } else if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openActionDropdown(selectedActionIndex);
                        }
                      }}
                      aria-haspopup="listbox"
                      aria-expanded={actionMenuOpen}
                      className={`portal-field-focus flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm outline-none md:py-3.5 ${
                        actionMenuOpen
                          ? 'border-border bg-background/60'
                          : 'border-border/40 bg-background/45'
                      }`}
                    >
                      <span>
                        {selectedActionOption?.label ?? proposalAction}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          actionMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <FloatingPanelMenu
                      open={actionMenuOpen}
                      align="full"
                      className="space-y-0.5 p-1 md:p-1.5"
                      role="listbox"
                      aria-label="Proposal action"
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          setActionActiveIndex((current) =>
                            Math.min(
                              current + 1,
                              selectableProposalMenuItems.length - 1
                            )
                          );
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          setActionActiveIndex((current) =>
                            Math.max(current - 1, 0)
                          );
                        } else if (event.key === 'Home') {
                          event.preventDefault();
                          setActionActiveIndex(0);
                        } else if (event.key === 'End') {
                          event.preventDefault();
                          setActionActiveIndex(
                            selectableProposalMenuItems.length - 1
                          );
                        } else if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectActionAtIndex(actionActiveIndex);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          closeActionDropdown();
                        } else if (event.key === 'Tab') {
                          closeActionDropdown();
                        }
                      }}
                    >
                      {actionMenuItems.map((item) => {
                        if (item.kind === 'section') {
                          return (
                            <div
                              key={item.id}
                              className="px-3 pt-1.5 pb-0.5 first:pt-1"
                              role="presentation"
                            >
                              <p className="portal-type-caption font-medium uppercase tracking-[0.16em] text-muted-foreground">
                                {item.label}
                              </p>
                            </div>
                          );
                        }

                        if (item.kind === 'policy_link') {
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              role="option"
                              onClick={() => closeActionDropdown()}
                              className={`${floatingPanelItemClass} justify-between`}
                            >
                              <span>{item.label}</span>
                              <ProtocolMotionArrow className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </Link>
                          );
                        }

                        const proposalIndex =
                          selectableProposalMenuItems.findIndex(
                            (option) => option.id === item.id
                          );
                        const selected = item.id === proposalAction;
                        const active = proposalIndex === actionActiveIndex;

                        return (
                          <button
                            ref={(element) => {
                              actionOptionRefs.current[proposalIndex] = element;
                            }}
                            key={item.id}
                            id={`governance-create-action-option-${proposalIndex}`}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            tabIndex={active ? 0 : -1}
                            onClick={() => selectActionAtIndex(proposalIndex)}
                            onMouseEnter={() =>
                              setActionActiveIndex(proposalIndex)
                            }
                            className={`${floatingPanelItemClass} justify-between ${
                              selected
                                ? floatingPanelItemSelectedClass
                                : active
                                  ? floatingPanelItemActiveClass
                                  : ''
                            }`}
                          >
                            <span>{item.label}</span>
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                              {selected ? <Check className="h-4 w-4" /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </FloatingPanelMenu>
                  </div>
                ) : (
                  <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm font-medium md:py-3.5">
                    {selectedActionOption?.label}
                  </div>
                )}
              </div>

              {isMembershipProposal ? (
                <>
                  <div>
                    <label
                      htmlFor={
                        showRoleDropdown ? 'governance-create-role' : undefined
                      }
                      className={fieldLabelClass}
                    >
                      Role
                    </label>
                    {roleOptions.length === 0 ? (
                      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
                        No membership roles available on this DAO yet.
                      </div>
                    ) : showRoleDropdown ? (
                      <div className="relative" ref={roleMenuContainerRef}>
                        <button
                          ref={roleTriggerRef}
                          id="governance-create-role"
                          type="button"
                          onClick={toggleRoleMenu}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              openRoleDropdown(
                                Math.min(
                                  selectedRoleIndex + 1,
                                  roleOptions.length - 1
                                )
                              );
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              openRoleDropdown(
                                Math.max(selectedRoleIndex - 1, 0)
                              );
                            } else if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              openRoleDropdown(selectedRoleIndex);
                            }
                          }}
                          aria-haspopup="listbox"
                          aria-expanded={roleMenuOpen}
                          className={`portal-field-focus flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm outline-none md:py-3.5 ${
                            roleMenuOpen
                              ? 'border-border bg-background/60'
                              : 'border-border/40 bg-background/45'
                          }`}
                        >
                          <span>{roleId}</span>
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              roleMenuOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        <FloatingPanelMenu
                          open={roleMenuOpen}
                          align="full"
                          className="space-y-0.5 p-1 md:p-1.5"
                          role="listbox"
                          aria-label="DAO role"
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              setRoleActiveIndex((current) =>
                                Math.min(current + 1, roleOptions.length - 1)
                              );
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              setRoleActiveIndex((current) =>
                                Math.max(current - 1, 0)
                              );
                            } else if (event.key === 'Home') {
                              event.preventDefault();
                              setRoleActiveIndex(0);
                            } else if (event.key === 'End') {
                              event.preventDefault();
                              setRoleActiveIndex(roleOptions.length - 1);
                            } else if (
                              event.key === 'Enter' ||
                              event.key === ' '
                            ) {
                              event.preventDefault();
                              selectRoleAtIndex(roleActiveIndex);
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              closeRoleDropdown();
                            } else if (event.key === 'Tab') {
                              closeRoleDropdown();
                            }
                          }}
                        >
                          {roleOptions.map((role, index) => {
                            const selected = role === roleId;
                            const active = index === roleActiveIndex;

                            return (
                              <button
                                ref={(element) => {
                                  roleOptionRefs.current[index] = element;
                                }}
                                key={role}
                                id={`governance-create-role-option-${index}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                tabIndex={active ? 0 : -1}
                                onClick={() => selectRoleAtIndex(index)}
                                onMouseEnter={() => setRoleActiveIndex(index)}
                                className={`${floatingPanelItemClass} justify-between ${
                                  selected
                                    ? floatingPanelItemSelectedClass
                                    : active
                                      ? floatingPanelItemActiveClass
                                      : ''
                                }`}
                              >
                                <span>{role}</span>
                                <span className="flex h-4 w-4 items-center justify-center">
                                  {selected ? (
                                    <Check className="h-4 w-4" />
                                  ) : null}
                                </span>
                              </button>
                            );
                          })}
                        </FloatingPanelMenu>
                      </div>
                    ) : (
                      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm font-medium md:py-3.5">
                        {roleId}
                      </div>
                    )}
                  </div>

                  {isAddMemberAction || isRemoveMemberAction ? (
                    <div>
                      <label
                        htmlFor="governance-create-member"
                        className={fieldLabelClass}
                      >
                        Member
                      </label>
                      {isRemoveMemberAction ? (
                        <NearAccountPicker
                          key={`${roleId}-remove`}
                          id="governance-create-member"
                          value={nominatedAccountInput}
                          options={removableMemberOptions}
                          placeholder="Select member"
                          emptyLabel={`No other members in ${roleId || 'this role'} yet.`}
                          onValueChange={(nextValue) => {
                            setNominatedAccountInput(nextValue);
                            setError('');
                          }}
                        />
                      ) : (
                        <NearAccountField
                          key={proposalAction}
                          id="governance-create-member"
                          variant="editable"
                          value={nominatedAccountInput}
                          accountId={proposerAccountId}
                          requirePortalProfile={false}
                          onValueChange={(nextValue) => {
                            setNominatedAccountInput(nextValue);
                            setError('');
                          }}
                        />
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}

              {isTransferAction ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PortalFieldSelect
                      label="Token"
                      value={transferTokenId}
                      options={transferAssetOptions}
                      onChange={(nextTokenId) => {
                        setTransferTokenId(nextTokenId);
                        setTransferAmountInput('');
                        setError('');
                      }}
                      disabled={
                        transferAssetsLoading || transferAssets.length === 0
                      }
                      placeholder={
                        transferAssetsLoading ? 'Loading tokens…' : 'No tokens'
                      }
                      ariaLabel="Transfer token"
                    />
                    <div>
                      <label
                        htmlFor="governance-create-transfer-amount"
                        className={fieldLabelClass}
                      >
                        Amount
                        {selectedTransferAsset
                          ? ` (${selectedTransferAsset.symbol})`
                          : ''}
                      </label>
                      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5 md:px-4">
                        <input
                          id="governance-create-transfer-amount"
                          type="text"
                          inputMode="decimal"
                          value={transferAmountInput}
                          onChange={(event) => {
                            setTransferAmountInput(
                              sanitizeTokenAmountInput(
                                event.target.value,
                                selectedTransferAsset?.decimals ?? 24
                              )
                            );
                            setError('');
                          }}
                          placeholder="0.0"
                          disabled={!selectedTransferAsset}
                          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
                        />
                      </div>
                      {selectedTransferAsset ? (
                        <p className="mt-1.5 portal-type-caption text-muted-foreground/70">
                          DAO balance:{' '}
                          {formatSmallestTokenAmount(
                            selectedTransferAsset.balanceSmallest,
                            selectedTransferAsset.decimals,
                            6
                          )}{' '}
                          {selectedTransferAsset.symbol}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="governance-create-transfer-receiver"
                      className={fieldLabelClass}
                    >
                      Recipient
                    </label>
                    <NearAccountField
                      id="governance-create-transfer-receiver"
                      variant="editable"
                      value={transferReceiverInput}
                      accountId={proposerAccountId}
                      requirePortalProfile={false}
                      onValueChange={(nextValue) => {
                        setTransferReceiverInput(nextValue);
                        setError('');
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {isTransferOwnershipAction ? (
                <div className="space-y-2">
                  <div>
                    <PortalFieldSelect
                      label="Contract"
                      value={transferOwnershipContractId}
                      options={managedContractOptions}
                      onChange={(nextContractId) => {
                        setTransferOwnershipContractId(nextContractId);
                        setError('');
                      }}
                      disabled={
                        managedContractsLoading || managedContracts.length === 0
                      }
                      placeholder={
                        managedContractsLoading
                          ? 'Loading contracts…'
                          : 'No contracts'
                      }
                      ariaLabel="Contract to transfer"
                    />
                    {selectedManagedContract ? (
                      <p className="mt-1.5 portal-type-caption text-muted-foreground/60">
                        {selectedManagedContract.contractId}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="governance-create-transfer-ownership-owner"
                      className={fieldLabelClass}
                    >
                      New owner
                    </label>
                    <NearAccountField
                      id="governance-create-transfer-ownership-owner"
                      variant="editable"
                      value={transferOwnershipNewOwnerInput}
                      accountId={proposerAccountId}
                      requirePortalProfile={false}
                      onValueChange={(nextValue) => {
                        setTransferOwnershipNewOwnerInput(nextValue);
                        setError('');
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {isSocialSpendTreasuryAction ? (
                <div className="space-y-2">
                  {isFundSeasonPoolAction ? (
                    <>
                      <div>
                        <PortalFieldSelect
                          label="Fund from"
                          value={activeFundSeasonPoolSource}
                          options={fundSeasonPoolSourceOptions.map(
                            (option) => ({
                              value: option.value,
                              label: option.label,
                            })
                          )}
                          onChange={(nextSource) => {
                            setFundSeasonPoolSource(
                              nextSource as FundSeasonPoolSource
                            );
                            setSocialSpendAmountInput('');
                            setError('');
                          }}
                          disabled={
                            socialSpendTreasuryLoading ||
                            fundSeasonPoolSourceOptions.length === 0
                          }
                          placeholder="Select funding source"
                          ariaLabel="Rally pool funding source"
                        />
                      </div>
                      <div>
                        <PortalFieldSelect
                          label="Season"
                          value={socialSpendSeasonId}
                          options={socialSpendSeasonOptions}
                          onChange={(nextSeasonId) => {
                            setSocialSpendSeasonId(nextSeasonId);
                            setError('');
                          }}
                          disabled={
                            socialSpendTreasuryLoading ||
                            socialSpendSeasonOptions.length === 0
                          }
                          placeholder={
                            socialSpendTreasuryLoading
                              ? 'Loading seasons…'
                              : 'Select season'
                          }
                          ariaLabel="Season to fund"
                        />
                      </div>
                    </>
                  ) : null}
                  <div>
                    <label
                      htmlFor="governance-create-social-spend-amount"
                      className={fieldLabelClass}
                    >
                      Amount (SOCIAL)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="governance-create-social-spend-amount"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={socialSpendAmountInput}
                        onChange={(event) => {
                          setSocialSpendAmountInput(
                            sanitizeTokenAmountInput(event.target.value, 18)
                          );
                          setError('');
                        }}
                        placeholder="0"
                        className="portal-field-focus h-11 min-w-0 flex-1 rounded-2xl border border-border/40 bg-background/45 px-4 text-sm outline-none placeholder:text-muted-foreground/50"
                      />
                      {isWithdrawSocialTreasuryAction &&
                      socialSpendTreasuryBalance != null &&
                      socialSpendTreasuryBalance > 0n ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 shrink-0 px-3 text-xs"
                          onClick={() => {
                            setSocialSpendAmountInput(
                              yoctoToSocial(
                                socialSpendTreasuryContext?.treasuryBalanceYocto ??
                                  '0'
                              )
                            );
                            setError('');
                          }}
                        >
                          Full balance
                        </Button>
                      ) : null}
                      {isFundSeasonPoolAction &&
                      fundSeasonPoolSourceBalance != null &&
                      fundSeasonPoolSourceBalance > 0n ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 shrink-0 px-3 text-xs"
                          onClick={() => {
                            setSocialSpendAmountInput(
                              yoctoToSocial(
                                activeFundSeasonPoolSource === 'dao_wallet'
                                  ? (socialSpendTreasuryContext?.daoSocialBalanceYocto ??
                                      '0')
                                  : (socialSpendTreasuryContext?.treasuryBalanceYocto ??
                                      '0')
                              )
                            );
                            setError('');
                          }}
                        >
                          Full balance
                        </Button>
                      ) : null}
                    </div>
                    {isFundSeasonPoolAction ? (
                      <p className="mt-1.5 portal-type-caption text-muted-foreground/70">
                        {activeFundSeasonPoolSource === 'dao_wallet' ? (
                          <>
                            DAO SOCIAL balance:{' '}
                            {formatSocial(
                              socialSpendTreasuryContext?.daoSocialBalanceYocto ??
                                '0'
                            )}{' '}
                            SOCIAL
                          </>
                        ) : (
                          <>
                            Accrued on social-spend:{' '}
                            {formatSocial(
                              socialSpendTreasuryContext?.treasuryBalanceYocto ??
                                '0'
                            )}{' '}
                            SOCIAL
                          </>
                        )}
                      </p>
                    ) : socialSpendTreasuryContext?.treasuryBalanceYocto ? (
                      <p className="mt-1.5 portal-type-caption text-muted-foreground/70">
                        Accrued on social-spend:{' '}
                        {formatSocial(
                          socialSpendTreasuryContext.treasuryBalanceYocto
                        )}{' '}
                        SOCIAL
                        {socialSpendTreasuryContext.treasuryId ? (
                          <>
                            {' '}
                            · pays to{' '}
                            <span className="font-mono text-muted-foreground">
                              {socialSpendTreasuryContext.treasuryId}
                            </span>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {isWithdrawSocialTreasuryAction ? (
                      <p className="mt-1 portal-type-caption text-muted-foreground/60">
                        Collects rally join fees (5%) and support fees (1%)
                        accrued on social-spend into treasury_id.
                      </p>
                    ) : null}
                    {isFundSeasonPoolAction &&
                    socialSpendSeasonOptions.length === 0 ? (
                      <p className="mt-1 text-[11px] text-amber-600">
                        No live rally seasons on-chain right now.
                      </p>
                    ) : null}
                    {isWithdrawSocialTreasuryAction &&
                    daoBoard === 'governance' &&
                    socialSpendTreasuryContext?.treasuryId ? (
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        Fee sweeps are proposed on the{' '}
                        <Link
                          href="/governance/create?dao=treasury"
                          className="text-[var(--portal-blue)] underline-offset-2 hover:underline"
                        >
                          Treasury DAO
                        </Link>{' '}
                        board (social-spend treasury_id).
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="governance-create-description"
                  className={fieldLabelClass}
                >
                  {proposalAction === 'idea'
                    ? DAO_SIGNAL_PROPOSAL_LABEL
                    : 'Description'}
                </label>
                <div className="portal-field-focus relative rounded-2xl border border-border/40 bg-background/45">
                  <textarea
                    id="governance-create-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setShowDescriptionFeedback(false);
                      setError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={() => setShowDescriptionFeedback(true)}
                    placeholder={
                      proposalAction === 'idea'
                        ? DAO_SIGNAL_PROPOSAL_PLACEHOLDER
                        : isTransferAction
                          ? 'Why the DAO should send these funds'
                          : isWithdrawSocialTreasuryAction
                            ? 'Why the DAO should sweep these fees now'
                            : isFundSeasonPoolAction
                              ? 'Why the DAO should sponsor this rally pool'
                              : isTransferOwnershipAction
                                ? 'Why ownership should move to this account'
                                : proposalAction === 'leave_self'
                                  ? 'Why you are stepping back from this role'
                                  : proposalAction === 'remove_member'
                                    ? `Why they should leave ${roleId || 'the role'}`
                                    : proposalAction === 'join_self'
                                      ? `Why you should join ${roleId || 'the role'}`
                                      : `Why they should join ${roleId || 'the role'}`
                    }
                    rows={3}
                    maxLength={PROPOSAL_DESCRIPTION_LIMITS.max}
                    className="w-full resize-none rounded-2xl bg-transparent px-4 pt-3 pb-7 text-sm outline-none placeholder:text-muted-foreground/50 md:pt-3.5"
                  />
                  <span
                    className={`pointer-events-none absolute right-3 bottom-2 portal-type-caption tabular-nums tracking-wide ${getBoundedNoteCounterClass(
                      descriptionLength,
                      hasDescription,
                      PROPOSAL_DESCRIPTION_LIMITS
                    )}`}
                  >
                    {getBoundedNoteCounterLabel(
                      descriptionLength,
                      PROPOSAL_DESCRIPTION_LIMITS
                    )}
                  </span>
                </div>
                <AnimatePresence initial={false}>
                  {showDescriptionFeedback &&
                  hasDescription &&
                  descriptionTextError ? (
                    <motion.p
                      key="governance-create-description-error"
                      initial={descriptionFeedbackEnter}
                      animate={descriptionFeedbackAnimate}
                      exit={descriptionFeedbackExit}
                      transition={descriptionFeedbackTransition}
                      className="mt-2 text-xs text-amber-600"
                    >
                      {descriptionTextError}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>

              {error || blockedReason ? (
                <div className="min-h-[1.25rem] text-sm text-muted-foreground">
                  {error ? (
                    <p className="portal-red-text">{error}</p>
                  ) : (
                    <p>{blockedReason}</p>
                  )}
                </div>
              ) : null}

              <Button
                type="button"
                className="h-11 w-full"
                disabled={!canSubmit}
                loading={submitting}
                onClick={() => {
                  void handleSubmit();
                }}
              >
                {getProposalActionSubmitLabel(proposalAction)}
              </Button>
            </div>
          </div>
        )}
      </SurfacePanel>
    </>
  );
}
