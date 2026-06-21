'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';
import { PortalConnectPrompt } from '@/components/ui/portal-connect-prompt';
import { portalConnectMessage } from '@/lib/portal-connect-copy';
import { CompactActionSkeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  GovernanceCreateEligibilityLine,
  GovernanceCreateProposalSummaryBlock,
  GovernanceCreateActionMenuOption,
  GovernanceCreateActionPolicyLink,
  GovernanceCreateActionCategoryStrip,
  governanceCreateActionMenuListClass,
  governanceCreateActionMenuShellClass,
  resolveGovernanceCreateBlockedSubmitLabel,
  resolveGovernanceCreateNoActionsMessage,
  governanceCreateFieldLabelClass,
  governanceCreateFieldShellClass,
  governanceCreateFieldTriggerClass,
} from '@/features/governance/governance-create-compact-ui';
import {
  resolveGovernanceCreateProposalSummary,
  resolveGovernanceCreateSubmitFeedback,
} from '@/features/governance/governance-create-proposal-summary';
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
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useFloatingPanelScroll } from '@/hooks/use-floating-panel-scroll';
import { fetchDaoPolicy, submitDaoProposal } from '@/features/governance/api';
import {
  buildDaoIdeaProposalPayload,
  buildDaoMemberProposalPayload,
  buildDaoFundSeasonPoolPayload,
  buildDaoContractUpgradeProposalPayload,
  buildDaoContractConfigProposalPayload,
  buildDaoTransferOwnershipProposalPayload,
  buildDaoTransferProposalPayload,
  buildDaoWithdrawBoostInfraPayload,
  buildDaoSetBoostInfraAuthorityPayload,
  buildGovernanceCreateActionMenuItems,
  groupGovernanceCreateActionMenuItems,
  resolveGovernanceCreateActionMenuCategoryId,
  buildProtocolProposalAppId,
  canProposeDaoKind,
  canProposePolicyChange,
  DAO_SIGNAL_PROPOSAL_LABEL,
  getCreatableDaoProposalActionOption,
  getCreatableDaoRoleOptions,
  getDaoGroupMembershipRoleNames,
  getDaoGroupRoleMemberOptions,
  getDaoKindPermissionBlockReason,
  getProposalActionSubmitLabel,
  getProposalKindBlockReason,
  isDaoGroupMember,
  isDaoHashUpgradableContractId,
  isProposalActionNomination,
  normalizePublishedCodeHash,
  proposalActionToKind,
  resolveAvailablePolicyActionsForProposer,
  resolveAvailableProposalActionsForCreate,
  resolveActiveCreatableProposalAction,
  resolveCreatableProposalActionsForProposer,
  resolveGovernanceCreateDescriptionPlaceholder,
  resolveGovernanceCreateProposalPreviewActions,
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
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
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
  lookupPublishedGlobalContractCode,
  sanitizeTokenAmountInput,
  socialToYocto,
  tokenAmountToSmallestUnit,
  tryParseYoctoBigInt,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';
import { cn } from '@/lib/utils';
import {
  getBoundedNoteFieldCounter,
  isBoundedNoteReady,
  normalizeBoundedNote,
  PROPOSAL_DESCRIPTION_LIMITS,
} from '@/lib/bounded-note-field';
import {
  SocialSpendActionRoutingFields,
  useSocialSpendActionRoutingDraft,
} from '@/features/governance/governance-contract-config-fields';
import {
  SocialSpendSeasonConfigFields,
  useSocialSpendSeasonConfigDraft,
} from '@/features/governance/governance-season-config-fields';
import {
  canProposeSocialSpendActionRoutingDraft,
  formatSocialSpendRoutingFixedFieldsCaption,
  getDaoContractConfigOperationsForContract,
  getSocialSpendActionRoutingOperationConfig,
  isSocialSpendActionRoutingOperationId,
  isSupportSpendRoutingOperationId,
  isSocialSpendRoutingMinEditableOperationId,
  validateSeasonConfigDraft,
  validateSeasonIdDraft,
  seasonConfigDraftChanged,
  socialSpendActionRoutingProposalBlocker,
  type DaoContractConfigOperationId,
} from '@/lib/dao-contract-config-operations';

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

const fieldLabelClass = governanceCreateFieldLabelClass;

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
  daoSocialBalanceYocto: string;
  canFundSeasonPool: boolean;
  fundableSeasonIds: string[];
}

interface DaoBoostInfraContext {
  contractId: string;
  infraPoolYocto: string;
  ownerId: string | null;
  infraWithdrawAuthority: string | null;
  treasuryDaoAccountId: string;
  defaultReceiverId: string;
  canWithdrawBoostInfra: boolean;
  canSetBoostInfraAuthority: boolean;
}

export function GovernanceCreatePanel({
  daoAccountId = GOVERNANCE_DAO_ACCOUNT,
}: {
  daoAccountId?: string;
}) {
  const router = useRouter();
  const { accountId, connect, wallet, isConnected, isLoading: walletLoading } = useWallet();
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
  const [contractUpgradeContractId, setContractUpgradeContractId] =
    useState('');
  const [contractUpgradeCodeHashInput, setContractUpgradeCodeHashInput] =
    useState('');
  const [contractUpgradeHashLookup, setContractUpgradeHashLookup] = useState<
    'idle' | 'checking' | 'published' | 'missing' | 'invalid'
  >('idle');
  const [contractConfigContractId, setContractConfigContractId] = useState('');
  const [contractConfigOperationId, setContractConfigOperationId] = useState<
    DaoContractConfigOperationId | ''
  >('');
  const [managedContracts, setManagedContracts] = useState<
    DaoManagedContractOption[]
  >([]);
  const [managedContractsLoading, setManagedContractsLoading] = useState(false);
  const [socialSpendTreasuryContext, setSocialSpendTreasuryContext] =
    useState<DaoSocialSpendTreasuryContext | null>(null);
  const [socialSpendTreasuryLoading, setSocialSpendTreasuryLoading] =
    useState(false);
  const [boostInfraContext, setBoostInfraContext] =
    useState<DaoBoostInfraContext | null>(null);
  const [boostInfraLoading, setBoostInfraLoading] = useState(false);
  const [boostInfraAmountInput, setBoostInfraAmountInput] = useState('');
  const [socialSpendAmountInput, setSocialSpendAmountInput] = useState('');
  const [socialSpendSeasonId, setSocialSpendSeasonId] = useState('');
  const [description, setDescription] = useState('');
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
  const [actionMenuCategoryId, setActionMenuCategoryId] = useState('membership');
  const actionTriggerRef = useRef<HTMLButtonElement>(null);
  const actionOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const {
    isOpen: actionMenuOpen,
    open: openActionMenu,
    close: closeActionMenu,
    toggle: toggleActionMenu,
    containerRef: actionMenuContainerRef,
  } = useDropdown();
  const {
    ref: actionMenuScrollRef,
    onWheelCapture: handleActionMenuWheelCapture,
  } = useFloatingPanelScroll<HTMLDivElement>(actionMenuOpen);
  const [touchLikePointer, setTouchLikePointer] = useState(false);

  useEffect(() => {
    setTouchLikePointer(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useBodyScrollLock(actionMenuOpen && touchLikePointer, actionMenuScrollRef);

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
    setProposalAction('idea');
    setDescription('');
    setNominatedAccountInput('');
    setTransferReceiverInput('');
    setTransferTokenId('');
    setTransferAmountInput('');
    setTransferAssets([]);
    setTransferAssetsLoading(false);
    setSocialSpendTreasuryContext(null);
    setSocialSpendTreasuryLoading(false);
    setSocialSpendAmountInput('');
    setSocialSpendSeasonId('');
    setBoostInfraContext(null);
    setBoostInfraLoading(false);
    setBoostInfraAmountInput('');
    setManagedContracts([]);
    setManagedContractsLoading(false);
    setTransferOwnershipContractId('');
    setTransferOwnershipNewOwnerInput('');
    setContractUpgradeContractId('');
    setContractUpgradeCodeHashInput('');
    setContractConfigContractId('');
    setContractConfigOperationId('');
  }, [daoAccountId]);

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
  const canProposeContractUpgrade =
    baseAvailableProposalActions.includes('contract_upgrade');
  const canProposeContractConfig =
    baseAvailableProposalActions.includes('contract_config');
  const canProposeManagedContracts =
    canProposeTransferOwnership ||
    canProposeContractUpgrade ||
    canProposeContractConfig;
  const canProposeFundSeasonPool =
    baseAvailableProposalActions.includes('fund_season_pool');
  const canProposeBoostInfra =
    baseAvailableProposalActions.includes('withdraw_boost_infra') ||
    baseAvailableProposalActions.includes('set_boost_infra_authority');

  useEffect(() => {
    if (!canProposeFundSeasonPool) {
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
  }, [canProposeFundSeasonPool, daoAccountId]);

  useEffect(() => {
    if (!canProposeBoostInfra) {
      return;
    }

    let cancelled = false;
    setBoostInfraLoading(true);

    void fetch(
      `/api/governance/dao/boost-infra?daoAccountId=${encodeURIComponent(daoAccountId)}`,
      { cache: 'no-store' }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          context?: DaoBoostInfraContext | null;
        } | null;

        if (cancelled) {
          return;
        }

        const context = payload?.context ?? null;
        setBoostInfraContext(context);
        if (!context) {
          setBoostInfraAmountInput('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBoostInfraContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBoostInfraLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canProposeBoostInfra, daoAccountId]);

  useEffect(() => {
    if (!canProposeManagedContracts) {
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
        const upgradableContracts = contracts.filter((contract) =>
          isDaoHashUpgradableContractId(contract.contractId)
        );
        setContractUpgradeContractId((current) => {
          if (
            upgradableContracts.some(
              (contract) => contract.contractId === current
            )
          ) {
            return current;
          }
          return upgradableContracts[0]?.contractId ?? '';
        });
        const configurableContracts = contracts.filter(
          (contract) =>
            getDaoContractConfigOperationsForContract(contract.contractId)
              .length > 0
        );
        setContractConfigContractId((current) => {
          if (
            configurableContracts.some(
              (contract) => contract.contractId === current
            )
          ) {
            return current;
          }
          return configurableContracts[0]?.contractId ?? '';
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
  }, [canProposeManagedContracts, daoAccountId]);

  const hashUpgradableManagedContracts = useMemo(
    () =>
      managedContracts.filter((contract) =>
        isDaoHashUpgradableContractId(contract.contractId)
      ),
    [managedContracts]
  );

  const configurableManagedContracts = useMemo(
    () =>
      managedContracts.filter(
        (contract) =>
          getDaoContractConfigOperationsForContract(contract.contractId)
            .length > 0
      ),
    [managedContracts]
  );

  const availableProposalActions = useMemo(
    () =>
      resolveAvailableProposalActionsForCreate(baseAvailableProposalActions, {
        managedContractsLoading,
        managedContractsCount: managedContracts.length,
        hashUpgradableManagedContractsCount:
          hashUpgradableManagedContracts.length,
        configurableManagedContractsCount:
          configurableManagedContracts.length,
        socialSpendTreasuryLoading,
        socialSpendTreasuryContext: socialSpendTreasuryContext
          ? {
              canFundSeasonPool: socialSpendTreasuryContext.canFundSeasonPool,
              fundableSeasonIds: socialSpendTreasuryContext.fundableSeasonIds,
            }
          : null,
        boostInfraLoading,
        boostInfraContext: boostInfraContext
          ? {
              canWithdrawBoostInfra: boostInfraContext.canWithdrawBoostInfra,
              canSetBoostInfraAuthority:
                boostInfraContext.canSetBoostInfraAuthority,
            }
          : null,
        transferAssetsLoading,
        transferAssetsCount: transferAssets.length,
      }),
    [
      baseAvailableProposalActions,
      boostInfraContext,
      boostInfraLoading,
      configurableManagedContracts.length,
      hashUpgradableManagedContracts.length,
      managedContracts.length,
      managedContractsLoading,
      socialSpendTreasuryContext,
      socialSpendTreasuryLoading,
      transferAssets.length,
      transferAssetsLoading,
    ]
  );

  const canCreatePublicProposal = availableProposalActions.length > 0;
  const previewProposalActions = useMemo(
    () =>
      resolveGovernanceCreateProposalPreviewActions({
        policy: daoPolicy,
        roleId,
        proposerAccountId,
        delegatedWeight: eligibility?.delegatedWeight ?? '0',
        proposalThresholdWeight: eligibility?.requiredWeight ?? '0',
        isDaoMember:
          getDaoGroupMembershipRoleNames(daoPolicy, proposerAccountId).length >
          0,
        baseAvailableProposalActions,
        availableProposalActions,
      }),
    [
      availableProposalActions,
      baseAvailableProposalActions,
      daoPolicy,
      eligibility?.delegatedWeight,
      eligibility?.requiredWeight,
      proposerAccountId,
      roleId,
    ]
  );
  const displayedProposalActions = useMemo(
    () =>
      canCreatePublicProposal
        ? availableProposalActions
        : previewProposalActions.length > 0
          ? previewProposalActions
          : availableProposalActions,
    [
      availableProposalActions,
      canCreatePublicProposal,
      previewProposalActions,
    ]
  );

  const activeProposalAction = useMemo(
    () =>
      resolveActiveCreatableProposalAction(
        proposalAction,
        displayedProposalActions
      ),
    [displayedProposalActions, proposalAction]
  );

  useEffect(() => {
    if (!displayedProposalActions.includes('transfer')) {
      setTransferAssets([]);
      setTransferAssetsLoading(false);
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
  }, [daoAccountId, displayedProposalActions]);

  const proposalKind = proposalActionToKind(activeProposalAction);
  const isMembershipNomination =
    isProposalActionNomination(activeProposalAction);
  const isAddMemberAction = activeProposalAction === 'add_member';
  const isRemoveMemberAction = activeProposalAction === 'remove_member';
  const isTransferAction = activeProposalAction === 'transfer';
  const isTransferOwnershipAction =
    activeProposalAction === 'transfer_ownership';
  const isContractUpgradeAction = activeProposalAction === 'contract_upgrade';
  const isContractConfigAction = activeProposalAction === 'contract_config';
  const isFundSeasonPoolAction = activeProposalAction === 'fund_season_pool';
  const isWithdrawBoostInfraAction =
    activeProposalAction === 'withdraw_boost_infra';
  const isSetBoostInfraAuthorityAction =
    activeProposalAction === 'set_boost_infra_authority';
  const isBoostInfraAction =
    isWithdrawBoostInfraAction || isSetBoostInfraAuthorityAction;

  const selectedTransferAsset = useMemo(
    () =>
      transferAssets.find((asset) => asset.tokenId === transferTokenId) ??
      transferAssets[0] ??
      null,
    [transferAssets, transferTokenId]
  );

  const selectedManagedContract = useMemo(
    () =>
      managedContracts.find(
        (contract) => contract.contractId === transferOwnershipContractId
      ) ??
      managedContracts[0] ??
      null,
    [managedContracts, transferOwnershipContractId]
  );

  const selectedUpgradableContract = useMemo(
    () =>
      hashUpgradableManagedContracts.find(
        (contract) => contract.contractId === contractUpgradeContractId
      ) ??
      hashUpgradableManagedContracts[0] ??
      null,
    [contractUpgradeContractId, hashUpgradableManagedContracts]
  );

  const selectedConfigurableContract = useMemo(
    () =>
      configurableManagedContracts.find(
        (contract) => contract.contractId === contractConfigContractId
      ) ??
      configurableManagedContracts[0] ??
      null,
    [configurableManagedContracts, contractConfigContractId]
  );

  const contractConfigOperationOptions = useMemo(
    () =>
      getDaoContractConfigOperationsForContract(
        selectedConfigurableContract?.contractId ?? ''
      ).map((operation) => ({
        value: operation.id,
        label: operation.label,
        hint: operation.description,
      })),
    [selectedConfigurableContract?.contractId]
  );

  const actionRoutingOperationConfig = useMemo(() => {
    if (
      !isContractConfigAction ||
      !isSocialSpendActionRoutingOperationId(contractConfigOperationId)
    ) {
      return null;
    }

    return getSocialSpendActionRoutingOperationConfig(
      contractConfigOperationId
    );
  }, [contractConfigOperationId, isContractConfigAction]);

  const actionRoutingContractId = actionRoutingOperationConfig
    ? (selectedConfigurableContract?.contractId ?? '')
    : '';

  const {
    draft: actionRoutingDraft,
    baseline: actionRoutingBaseline,
    loading: actionRoutingLoading,
    loadError: actionRoutingLoadError,
    setDraft: setActionRoutingDraft,
    reload: reloadActionRouting,
  } = useSocialSpendActionRoutingDraft(
    actionRoutingContractId,
    actionRoutingOperationConfig
  );

  const seasonConfigContractId =
    isContractConfigAction &&
    contractConfigOperationId === 'social_spend_set_season_config'
      ? (selectedConfigurableContract?.contractId ?? '')
      : '';

  const {
    draft: seasonConfigDraft,
    baseline: seasonConfigBaseline,
    chainSeasonIds: seasonConfigChainSeasonIds,
    loading: seasonConfigLoading,
    refreshing: seasonConfigRefreshing,
    loadError: seasonConfigLoadError,
    setDraft: setSeasonConfigDraft,
    selectExistingSeason: selectSeasonConfigSeason,
    reload: reloadSeasonConfig,
    lookupReady: seasonConfigLookupReady,
    hasOnChainConfig: seasonConfigHasOnChainConfig,
  } = useSocialSpendSeasonConfigDraft(seasonConfigContractId);

  useEffect(() => {
    if (!isContractConfigAction) {
      return;
    }

    const operations = getDaoContractConfigOperationsForContract(
      contractConfigContractId
    );
    setContractConfigOperationId((current) => {
      if (operations.some((operation) => operation.id === current)) {
        return current;
      }
      return operations[0]?.id ?? '';
    });
  }, [contractConfigContractId, isContractConfigAction]);

  const managedContractOptions = useMemo(
    () =>
      managedContracts.map((contract) => ({
        value: contract.contractId,
        label: contract.label,
        hint: contract.contractId,
      })),
    [managedContracts]
  );

  const upgradableContractOptions = useMemo(
    () =>
      hashUpgradableManagedContracts.map((contract) => ({
        value: contract.contractId,
        label: contract.label,
        hint: contract.contractId,
      })),
    [hashUpgradableManagedContracts]
  );

  const configurableContractOptions = useMemo(
    () =>
      configurableManagedContracts.map((contract) => ({
        value: contract.contractId,
        label: contract.label,
        hint: contract.contractId,
      })),
    [configurableManagedContracts]
  );

  const contractUpgradeCodeHash = useMemo(
    () => normalizePublishedCodeHash(contractUpgradeCodeHashInput),
    [contractUpgradeCodeHashInput]
  );

  useEffect(() => {
    if (!isContractUpgradeAction) {
      setContractUpgradeHashLookup('idle');
      return;
    }

    if (!contractUpgradeCodeHash) {
      setContractUpgradeHashLookup('idle');
      return;
    }

    let cancelled = false;
    setContractUpgradeHashLookup('checking');

    const timer = window.setTimeout(() => {
      void lookupPublishedGlobalContractCode(contractUpgradeCodeHash)
        .then((lookup) => {
          if (cancelled) {
            return;
          }

          setContractUpgradeHashLookup(lookup.status);
        })
        .catch(() => {
          if (!cancelled) {
            setContractUpgradeHashLookup('invalid');
          }
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contractUpgradeCodeHash, isContractUpgradeAction]);

  const subjectAccountId = useMemo(() => {
    if (activeProposalAction === 'idea') {
      return proposerAccountId;
    }
    if (isMembershipNomination) {
      return normalizeNearAccountId(nominatedAccountInput);
    }
    return proposerAccountId;
  }, [
    activeProposalAction,
    isMembershipNomination,
    nominatedAccountInput,
    proposerAccountId,
  ]);
  const subjectLookup = useMemberAccountLookup(subjectAccountId, {
    trustedAccount: true,
  });
  const isInitialLoading =
    walletLoading || (!!accountId && !eligibility && (loading || !error));
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
  const daoMemberRoles = useMemo(
    () => getDaoGroupMembershipRoleNames(daoPolicy, proposerAccountId),
    [daoPolicy, proposerAccountId]
  );
  const isMembershipProposal =
    activeProposalAction !== 'idea' &&
    activeProposalAction !== 'transfer' &&
    activeProposalAction !== 'transfer_ownership' &&
    activeProposalAction !== 'contract_upgrade' &&
    activeProposalAction !== 'contract_config' &&
    !isFundSeasonPoolAction &&
    !isBoostInfraAction;
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
  const positionPath = useMemo(
    () => buildGovernancePathWithBoard('/governance/manage', daoBoard),
    [daoBoard]
  );
  const actionMenuItems = useMemo(
    () =>
      buildGovernanceCreateActionMenuItems({
        availableProposalActions: displayedProposalActions,
        availablePolicyActions: canCreatePublicProposal
          ? availablePolicyActions
          : [],
        daoBoard,
      }),
    [
      availablePolicyActions,
      canCreatePublicProposal,
      daoBoard,
      displayedProposalActions,
    ]
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
  const actionMenuCategories = useMemo(
    () => groupGovernanceCreateActionMenuItems(actionMenuItems),
    [actionMenuItems]
  );
  const visibleActionMenuCategory = useMemo(
    () =>
      actionMenuCategories.find(
        (category) => category.id === actionMenuCategoryId
      ) ?? actionMenuCategories[0],
    [actionMenuCategories, actionMenuCategoryId]
  );
  const visibleActionMenuItems = visibleActionMenuCategory?.items ?? [];
  const visibleSelectableProposalMenuItems = useMemo(
    () =>
      visibleActionMenuItems.filter(
        (
          item
        ): item is Extract<
          GovernanceCreateActionMenuItem,
          { kind: 'proposal' }
        > => item.kind === 'proposal'
      ),
    [visibleActionMenuItems]
  );
  const selectedActionOption =
    getCreatableDaoProposalActionOption(activeProposalAction);
  const descriptionPlaceholder = useMemo(
    () =>
      resolveGovernanceCreateDescriptionPlaceholder(
        activeProposalAction,
        roleId
      ),
    [activeProposalAction, roleId]
  );

  useEffect(() => {
    setDescription('');
  }, [activeProposalAction]);

  const selectedActionIndex = useMemo(() => {
    const categoryId = resolveGovernanceCreateActionMenuCategoryId(
      activeProposalAction
    );
    const category =
      actionMenuCategories.find((entry) => entry.id === categoryId) ??
      actionMenuCategories[0];
    const proposals =
      category?.items.filter(
        (item): item is Extract<GovernanceCreateActionMenuItem, { kind: 'proposal' }> =>
          item.kind === 'proposal'
      ) ?? [];
    const index = proposals.findIndex((option) => option.id === activeProposalAction);

    return Math.max(0, index);
  }, [actionMenuCategories, activeProposalAction]);
  const activeCategoryProposalCount = useMemo(() => {
    const categoryId = resolveGovernanceCreateActionMenuCategoryId(
      activeProposalAction
    );
    const category =
      actionMenuCategories.find((entry) => entry.id === categoryId) ??
      actionMenuCategories[0];

    return (
      category?.items.filter((item) => item.kind === 'proposal').length ?? 0
    );
  }, [actionMenuCategories, activeProposalAction]);

  useEffect(() => {
    if (actionMenuCategories.length === 0 || actionMenuOpen) {
      return;
    }

    const categoryId = resolveGovernanceCreateActionMenuCategoryId(
      activeProposalAction
    );

    if (actionMenuCategories.some((category) => category.id === categoryId)) {
      setActionMenuCategoryId(categoryId);
    }
  }, [actionMenuCategories, actionMenuOpen, activeProposalAction]);
  const showActionDropdown =
    selectableProposalMenuItems.length +
      (canCreatePublicProposal ? availablePolicyActions.length : 0) >
    1;
  const remainingToThresholdDisplay = useMemo(() => {
    if (!eligibility) {
      return '…';
    }

    return formatSocial(eligibility.remainingToThreshold ?? '0');
  }, [eligibility]);
  const createNoActionsMessage = useMemo(
    () =>
      resolveGovernanceCreateNoActionsMessage({
        isDaoMember: daoMemberRoles.length > 0,
        hasEnoughDelegation: eligibility?.canPropose ?? false,
        hasEnoughBond: canCoverBond,
        remainingToThresholdDisplay,
        bondDisplay,
        baseProposalActionCount: baseAvailableProposalActions.length,
        availableProposalActionCount: availableProposalActions.length,
        hasPolicyActions: availablePolicyActions.length > 0,
      }),
    [
      availablePolicyActions.length,
      availableProposalActions.length,
      baseAvailableProposalActions.length,
      bondDisplay,
      canCoverBond,
      daoMemberRoles.length,
      eligibility?.canPropose,
      remainingToThresholdDisplay,
    ]
  );
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
  const daoSocialBalance = useMemo(
    () =>
      tryParseYoctoBigInt(
        socialSpendTreasuryContext?.daoSocialBalanceYocto ?? '0'
      ),
    [socialSpendTreasuryContext?.daoSocialBalanceYocto]
  );
  const socialSpendAmountExceedsBalance = useMemo(() => {
    if (!socialSpendAmountYocto || daoSocialBalance == null) {
      return false;
    }

    try {
      return BigInt(socialSpendAmountYocto) > daoSocialBalance;
    } catch {
      return false;
    }
  }, [daoSocialBalance, socialSpendAmountYocto]);
  const socialSpendSeasonOptions = useMemo(() => {
    const seasonIds = socialSpendTreasuryContext?.fundableSeasonIds ?? [];
    return seasonIds.map((seasonId) => ({
      value: seasonId,
      label: seasonId,
    }));
  }, [socialSpendTreasuryContext?.fundableSeasonIds]);
  const socialSpendTreasuryReady =
    !!socialSpendTreasuryContext &&
    isFundSeasonPoolAction &&
    socialSpendTreasuryContext.canFundSeasonPool &&
    socialSpendAmountYocto != null &&
    BigInt(socialSpendAmountYocto) > 0n &&
    socialSpendSeasonId.trim().length > 0 &&
    socialSpendSeasonOptions.length > 0 &&
    !socialSpendAmountExceedsBalance;
  const boostInfraAmountYocto = useMemo(() => {
    const normalized = boostInfraAmountInput.trim();
    if (!normalized) {
      return null;
    }

    try {
      const yocto = socialToYocto(normalized);
      return isValidYoctoString(yocto) ? yocto : null;
    } catch {
      return null;
    }
  }, [boostInfraAmountInput]);
  const boostInfraPoolBalance = useMemo(
    () => tryParseYoctoBigInt(boostInfraContext?.infraPoolYocto ?? '0'),
    [boostInfraContext?.infraPoolYocto]
  );
  const boostInfraAmountExceedsPool = useMemo(() => {
    if (!boostInfraAmountYocto || boostInfraPoolBalance == null) {
      return false;
    }

    try {
      return BigInt(boostInfraAmountYocto) > boostInfraPoolBalance;
    } catch {
      return false;
    }
  }, [boostInfraAmountYocto, boostInfraPoolBalance]);
  const boostInfraReady =
    !!boostInfraContext &&
    (isWithdrawBoostInfraAction
      ? boostInfraContext.canWithdrawBoostInfra &&
        boostInfraAmountYocto != null &&
        BigInt(boostInfraAmountYocto) > 0n &&
        !boostInfraAmountExceedsPool
      : isSetBoostInfraAuthorityAction
        ? boostInfraContext.canSetBoostInfraAuthority
        : false);
  const transferOwnershipReady =
    !!selectedManagedContract &&
    isNearAccountInputReady(transferOwnershipNewOwnerInput);
  const contractUpgradeReady =
    !!selectedUpgradableContract &&
    contractUpgradeCodeHash != null &&
    contractUpgradeHashLookup === 'published';
  const contractConfigReady =
    !!selectedConfigurableContract &&
    (isSocialSpendActionRoutingOperationId(contractConfigOperationId)
      ? canProposeSocialSpendActionRoutingDraft(
          actionRoutingBaseline,
          actionRoutingDraft,
          contractConfigOperationId
        ) &&
        !actionRoutingLoading &&
        !actionRoutingLoadError
      : contractConfigOperationId === 'social_spend_set_season_config'
        ? !!seasonConfigDraft &&
          !validateSeasonConfigDraft(seasonConfigDraft) &&
          (seasonConfigBaseline === null ||
            seasonConfigDraftChanged(
              seasonConfigBaseline,
              seasonConfigDraft
            )) &&
          !seasonConfigLoading &&
          !seasonConfigLoadError
        : false);
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
  const contractConfigOperationLabel = useMemo(
    () =>
      contractConfigOperationOptions.find(
        (option) => option.value === contractConfigOperationId
      )?.label ?? null,
    [contractConfigOperationOptions, contractConfigOperationId]
  );
  const isSocialSpendRoutingConfig =
    isContractConfigAction &&
    isSocialSpendActionRoutingOperationId(contractConfigOperationId);
  const isSeasonConfigConfig =
    isContractConfigAction &&
    contractConfigOperationId === 'social_spend_set_season_config';
  const routingFixedFieldsCaption = useMemo(
    () =>
      isSocialSpendRoutingConfig && contractConfigOperationId
        ? formatSocialSpendRoutingFixedFieldsCaption(contractConfigOperationId)
        : null,
    [contractConfigOperationId, isSocialSpendRoutingConfig]
  );
  const seasonConfigIsNewSeason = useMemo(() => {
    if (!seasonConfigDraft) {
      return false;
    }

    const seasonId = seasonConfigDraft.season_id.trim().toLowerCase();
    return (
      seasonId.length > 0 && !seasonConfigChainSeasonIds.includes(seasonId)
    );
  }, [seasonConfigChainSeasonIds, seasonConfigDraft]);
  const seasonConfigNewSeasonOnChain = useMemo(() => {
    if (!seasonConfigDraft || !seasonConfigIsNewSeason) {
      return false;
    }

    if (validateSeasonIdDraft(seasonConfigDraft.season_id)) {
      return false;
    }

    return seasonConfigLookupReady && !seasonConfigHasOnChainConfig;
  }, [
    seasonConfigDraft,
    seasonConfigHasOnChainConfig,
    seasonConfigIsNewSeason,
    seasonConfigLookupReady,
  ]);
  const proposalSummary = useMemo(
    () =>
      resolveGovernanceCreateProposalSummary({
        proposalAction: activeProposalAction,
        transferAmountInput,
        transferAmountSmallest,
        transferTokenSymbol: selectedTransferAsset?.symbol ?? null,
        transferReceiverId,
        socialSpendSeasonId,
        socialSpendAmountInput,
        boostInfraAmountInput,
        isWithdrawBoostInfraAction,
        isSetBoostInfraAuthorityAction,
        treasuryDaoAccountId: boostInfraContext?.treasuryDaoAccountId ?? '',
        roleId,
        subjectAccountId,
        isAddMemberAction,
        isRemoveMemberAction,
        contractUpgradeContractLabel: selectedUpgradableContract?.label ?? null,
        contractUpgradeCodeHash: contractUpgradeCodeHashInput,
        transferOwnershipContractLabel: selectedManagedContract?.label ?? null,
        transferOwnershipNewOwnerId,
        contractConfigOperationLabel,
        isContractConfigAction,
        isSocialSpendRoutingConfig,
        isSeasonConfigConfig,
        contractConfigOperationId,
        actionRoutingDraft,
        actionRoutingBaseline,
        actionRoutingLoading,
        actionRoutingLoadError,
        seasonConfigDraft,
        seasonConfigBaseline,
        seasonConfigLoading,
        seasonConfigLoadError,
        seasonConfigNewSeasonOnChain,
      }),
    [
      actionRoutingBaseline,
      actionRoutingDraft,
      actionRoutingLoadError,
      actionRoutingLoading,
      boostInfraAmountInput,
      boostInfraContext?.treasuryDaoAccountId,
      contractConfigOperationId,
      contractConfigOperationLabel,
      contractUpgradeCodeHashInput,
      isAddMemberAction,
      isContractConfigAction,
      isRemoveMemberAction,
      isSeasonConfigConfig,
      isSetBoostInfraAuthorityAction,
      isSocialSpendRoutingConfig,
      isWithdrawBoostInfraAction,
      activeProposalAction,
      roleId,
      seasonConfigBaseline,
      seasonConfigDraft,
      seasonConfigLoadError,
      seasonConfigLoading,
      seasonConfigNewSeasonOnChain,
      selectedManagedContract?.label,
      selectedTransferAsset?.symbol,
      selectedUpgradableContract?.label,
      socialSpendAmountInput,
      socialSpendSeasonId,
      subjectAccountId,
      transferAmountInput,
      transferAmountSmallest,
      transferOwnershipNewOwnerId,
      transferReceiverId,
    ]
  );

  const normalizedDescription = normalizeBoundedNote(description);
  const descriptionCounter = getBoundedNoteFieldCounter(
    description,
    PROPOSAL_DESCRIPTION_LIMITS
  );
  const descriptionReady = isBoundedNoteReady(
    description,
    PROPOSAL_DESCRIPTION_LIMITS
  );
  const proposalActionAllowed = canCreatePublicProposal
    ? availableProposalActions.includes(activeProposalAction)
    : displayedProposalActions.includes(activeProposalAction);
  const canSubmit =
    canCreatePublicProposal &&
    isConnected &&
    canCoverBond &&
    Boolean(proposerAccountId) &&
    canProposeSelectedKind &&
    (isTransferAction
      ? transferReady
      : isTransferOwnershipAction
        ? transferOwnershipReady
        : isContractUpgradeAction
          ? contractUpgradeReady
          : isContractConfigAction
            ? contractConfigReady
            : isFundSeasonPoolAction
              ? socialSpendTreasuryReady
              : isBoostInfraAction
                ? boostInfraReady
                : isMembershipProposal
                  ? roleId.trim().length > 0 && subjectReady
                  : true) &&
    proposalActionAllowed &&
    descriptionReady &&
    !submitting;

  const blockedReason = useMemo(() => {
    if (!isConnected) return portalConnectMessage('governance.create');
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
      return '';
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
      isContractUpgradeAction &&
      hashUpgradableManagedContracts.length === 0 &&
      !managedContractsLoading
    ) {
      return 'This DAO does not own any hash-upgradable protocol contracts right now.';
    }
    if (isContractUpgradeAction && contractUpgradeCodeHashInput.trim()) {
      if (!contractUpgradeCodeHash) {
        return 'Enter a valid published global WASM code hash.';
      }
      if (contractUpgradeHashLookup === 'checking') {
        return 'Checking whether this hash is published on the network…';
      }
      if (contractUpgradeHashLookup === 'missing') {
        return 'This hash is not published globally on this network yet.';
      }
      if (contractUpgradeHashLookup === 'invalid') {
        return 'Could not verify this hash on the network. Try again.';
      }
    }
    if (
      isContractConfigAction &&
      configurableManagedContracts.length === 0 &&
      !managedContractsLoading
    ) {
      return 'This DAO does not own any configurable protocol contracts right now.';
    }
    if (isContractConfigAction && actionRoutingLoading) {
      return 'Loading current contract settings from chain…';
    }
    if (isContractConfigAction && seasonConfigLoading) {
      return 'Loading season config from chain…';
    }
    if (isContractConfigAction && actionRoutingLoadError) {
      return actionRoutingLoadError;
    }
    if (isContractConfigAction && seasonConfigLoadError) {
      return seasonConfigLoadError;
    }
    if (
      isContractConfigAction &&
      isSocialSpendActionRoutingOperationId(contractConfigOperationId)
    ) {
      const routingBlocker = socialSpendActionRoutingProposalBlocker(
        actionRoutingBaseline,
        actionRoutingDraft,
        contractConfigOperationId
      );
      if (routingBlocker) {
        return routingBlocker;
      }
    }
    if (
      isContractConfigAction &&
      contractConfigOperationId === 'social_spend_set_season_config' &&
      seasonConfigDraft
    ) {
      const seasonValidationError =
        validateSeasonConfigDraft(seasonConfigDraft);
      if (seasonValidationError) {
        return seasonValidationError;
      }
      if (
        seasonConfigBaseline &&
        !seasonConfigDraftChanged(seasonConfigBaseline, seasonConfigDraft)
      ) {
        return 'Change at least one season field before proposing.';
      }
    }
    if (
      isFundSeasonPoolAction &&
      !socialSpendTreasuryLoading &&
      canProposeFundSeasonPool
    ) {
      if (
        isFundSeasonPoolAction &&
        !socialSpendTreasuryContext?.canFundSeasonPool
      ) {
        return 'Fund rally pool is available on the Treasury DAO board (?dao=treasury).';
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
      isFundSeasonPoolAction &&
      !socialSpendTreasuryContext &&
      !socialSpendTreasuryLoading
    ) {
      return 'Rally pool funding is unavailable for this DAO.';
    }
    if (isFundSeasonPoolAction && socialSpendAmountInput.trim()) {
      if (!socialSpendAmountYocto) {
        return 'Enter a valid SOCIAL amount.';
      }
      if (isFundSeasonPoolAction && socialSpendAmountExceedsBalance) {
        return 'Amount exceeds DAO SOCIAL balance.';
      }
    }
    if (isBoostInfraAction && !boostInfraLoading && canProposeBoostInfra) {
      if (
        isWithdrawBoostInfraAction &&
        !boostInfraContext?.canWithdrawBoostInfra
      ) {
        return 'Boost infra withdraw is available on the Treasury DAO board when it is the infra withdraw authority.';
      }
      if (
        isSetBoostInfraAuthorityAction &&
        !boostInfraContext?.canSetBoostInfraAuthority
      ) {
        return 'Delegate boost infra withdraw requires governance DAO to own boost and treasury not yet authorized.';
      }
    }
    if (isBoostInfraAction && !boostInfraContext && !boostInfraLoading) {
      return 'Boost infra actions are unavailable for this DAO right now.';
    }
    if (isWithdrawBoostInfraAction && boostInfraAmountInput.trim()) {
      if (!boostInfraAmountYocto) {
        return 'Enter a valid SOCIAL amount.';
      }
      if (boostInfraAmountExceedsPool) {
        return 'Amount exceeds boost infra pool balance.';
      }
    }
    if (isMembershipNomination && nominatedAccountInput.trim()) {
      const accountError = getNearAccountInputError(nominatedAccountInput);
      if (accountError) {
        return accountError;
      }
    }
    return '';
  }, [
    bondDisplay,
    canCoverBond,
    canProposeSelectedKind,
    daoPolicy,
    descriptionReady,
    isConnected,
    isMembershipNomination,
    isMembershipProposal,
    isRemoveMemberAction,
    isTransferAction,
    isTransferOwnershipAction,
    isContractUpgradeAction,
    isContractConfigAction,
    hashUpgradableManagedContracts.length,
    configurableManagedContracts.length,
    contractUpgradeCodeHash,
    contractUpgradeCodeHashInput,
    contractUpgradeHashLookup,
    actionRoutingBaseline,
    actionRoutingDraft,
    actionRoutingLoadError,
    actionRoutingLoading,
    contractConfigOperationId,
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
    isFundSeasonPoolAction,
    socialSpendAmountExceedsBalance,
    canProposeFundSeasonPool,
    socialSpendTreasuryContext,
    socialSpendTreasuryLoading,
    socialSpendSeasonOptions.length,
    socialSpendAmountInput,
    socialSpendAmountYocto,
    isWithdrawBoostInfraAction,
    isSetBoostInfraAuthorityAction,
    isBoostInfraAction,
    canProposeBoostInfra,
    boostInfraContext,
    boostInfraLoading,
    boostInfraAmountInput,
    boostInfraAmountYocto,
    boostInfraAmountExceedsPool,
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
  }, [isRemoveMemberAction, activeProposalAction, removableMemberOptions, roleId]);

  useEffect(() => {
    if (displayedProposalActions.length === 0) {
      return;
    }

    const nextAction = resolveActiveCreatableProposalAction(
      proposalAction,
      displayedProposalActions
    );

    if (nextAction === proposalAction) {
      return;
    }

    setProposalAction(nextAction);
    setNominatedAccountInput('');
    setTransferReceiverInput('');
    setTransferTokenId('');
    setTransferAmountInput('');
    setTransferOwnershipContractId('');
    setTransferOwnershipNewOwnerInput('');
    setContractUpgradeContractId('');
    setContractUpgradeCodeHashInput('');
    setSocialSpendAmountInput('');
  }, [displayedProposalActions, proposalAction]);

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
              : proposalKind === 'contract_upgrade'
                ? buildDaoContractUpgradeProposalPayload({
                    contractId: selectedUpgradableContract?.contractId ?? '',
                    contractLabel: selectedUpgradableContract?.label,
                    codeHash: contractUpgradeCodeHash ?? '',
                    description: normalizedDescription,
                  })
                : proposalKind === 'contract_config'
                  ? buildDaoContractConfigProposalPayload({
                      operationId:
                        contractConfigOperationId as DaoContractConfigOperationId,
                      contractLabel: selectedConfigurableContract?.label,
                      routing: actionRoutingDraft ?? undefined,
                      seasonConfig: seasonConfigDraft ?? undefined,
                      description: normalizedDescription,
                    })
                  : proposalKind === 'fund_season_pool'
                    ? buildDaoFundSeasonPoolPayload({
                        contractId:
                          socialSpendTreasuryContext?.contractId ?? '',
                        seasonId: socialSpendSeasonId,
                        amountYocto: socialSpendAmountYocto ?? '0',
                        description: normalizedDescription,
                      })
                    : proposalKind === 'withdraw_boost_infra'
                      ? buildDaoWithdrawBoostInfraPayload({
                          contractId: boostInfraContext?.contractId ?? '',
                          amountYocto: boostInfraAmountYocto ?? '0',
                          receiverId:
                            boostInfraContext?.defaultReceiverId ?? '',
                          description: normalizedDescription,
                        })
                      : proposalKind === 'set_boost_infra_authority'
                        ? buildDaoSetBoostInfraAuthorityPayload({
                            contractId: boostInfraContext?.contractId ?? '',
                            authorityId:
                              boostInfraContext?.treasuryDaoAccountId,
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
        submittedMessage: txToastGovPending.submittingProposal,
        successMessage: txToastGovSuccess.proposalSubmitted,
        failureMessage: txToastGovError.proposalSubmissionFailed,
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
    eligibility,
    normalizedDescription,
    isMembershipProposal,
    isTransferAction,
    isTransferOwnershipAction,
    isContractUpgradeAction,
    isContractConfigAction,
    contractConfigOperationId,
    contractUpgradeCodeHash,
    selectedUpgradableContract,
    selectedConfigurableContract,
    actionRoutingDraft,
    isFundSeasonPoolAction,
    proposalKind,
    proposerAccountId,
    roleId,
    selectedManagedContract,
    selectedTransferAsset,
    socialSpendAmountYocto,
    socialSpendSeasonId,
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

  const handleActionMenuCategoryChange = (categoryId: string) => {
    setActionMenuCategoryId(categoryId);

    const category = actionMenuCategories.find(
      (entry) => entry.id === categoryId
    );
    const proposals =
      category?.items.filter(
        (item): item is Extract<GovernanceCreateActionMenuItem, { kind: 'proposal' }> =>
          item.kind === 'proposal'
      ) ?? [];
    const selectedIndex = proposals.findIndex(
      (option) => option.id === activeProposalAction
    );

    setActionActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  };

  const openActionDropdown = (index = selectedActionIndex) => {
    const categoryId = resolveGovernanceCreateActionMenuCategoryId(
      activeProposalAction
    );
    const matchingCategory =
      actionMenuCategories.find((category) => category.id === categoryId) ??
      actionMenuCategories[0];

    if (matchingCategory) {
      setActionMenuCategoryId(matchingCategory.id);
    }

    setActionActiveIndex(index >= 0 ? index : 0);
    openActionMenu();
  };

  const closeActionDropdown = () => {
    closeActionMenu();
    actionTriggerRef.current?.focus();
  };

  const selectVisibleActionAtIndex = (index: number) => {
    const nextAction = visibleSelectableProposalMenuItems[index];
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
    setContractConfigContractId(
      configurableManagedContracts[0]?.contractId ?? ''
    );
    setContractConfigOperationId('');
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

  const blockedSubmitLabel = resolveGovernanceCreateBlockedSubmitLabel(
    createNoActionsMessage
  );
  const submitLabel =
    blockedSubmitLabel ??
    getProposalActionSubmitLabel(activeProposalAction);
  const showStickyCreateSubmit = Boolean(accountId && !isInitialLoading);
  const submitFeedbackMessage = useMemo(
    () => {
      if (!canCreatePublicProposal && blockedSubmitLabel) {
        return error ? error : null;
      }

      return resolveGovernanceCreateSubmitFeedback({
        error,
        blockedReason,
        proposalSummary,
        isContractConfigAction,
        isSocialSpendRoutingConfig,
        isSeasonConfigConfig,
      });
    },
    [
      blockedReason,
      blockedSubmitLabel,
      canCreatePublicProposal,
      error,
      isContractConfigAction,
      isSeasonConfigConfig,
      isSocialSpendRoutingConfig,
      proposalSummary,
    ]
  );

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel tone="soft" className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="portal-eyebrow-wide portal-blue-text">Create proposal</span>
            <p className="mt-2 text-xs text-muted-foreground">
              <a
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${resolvedDaoAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-muted-foreground/65 transition-colors hover:text-foreground/80"
              >
                @{resolvedDaoAccountId}
              </a>
            </p>
          </div>
          <div className="flex h-8 shrink-0 items-center gap-2">
            {walletLoading ? (
              <div className="h-8 w-8 shrink-0" aria-hidden />
            ) : accountId ? (
              <>
                {showPolicySettings ? (
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
                ) : null}
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
              </>
            ) : null}
          </div>
        </div>

        {!walletLoading && !accountId ? (
          <div className="mt-3 border-t border-fade-detail pt-3">
            <PortalConnectPrompt
              action="governance.create"
              variant="action"
              showNavHint={false}
              onConnect={() => {
                void connect();
              }}
            />
          </div>
        ) : isInitialLoading ? (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl border-t border-fade-detail pt-3">
            <div className="h-4 w-4/5 max-w-sm animate-pulse rounded bg-muted/40" />
            <CompactActionSkeleton className="mt-3 pt-3" tabCount={3} />
          </div>
        ) : (
          <div className="mx-auto mt-3 w-full min-w-0 max-w-xl border-t border-fade-detail pt-3">
            <GovernanceCreateEligibilityLine
              delegatedDisplay={delegatedDisplay}
              thresholdDisplay={thresholdDisplay}
              bondDisplay={bondDisplay}
              hasEnoughDelegation={eligibility?.canPropose ?? false}
              hasEnoughBond={canCoverBond}
              memberRoles={daoMemberRoles}
              positionPath={positionPath}
            />

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
                  <div
                    className={cn(
                      governanceCreateFieldShellClass,
                      'px-4 py-3 text-sm text-muted-foreground md:py-3'
                    )}
                  >
                    {availablePolicyActions.length > 0 ? (
                      <p>
                        Policy updates only.{' '}
                        <Link
                          href={policyPath}
                          className="portal-action-link font-medium"
                        >
                          Open policy
                        </Link>
                      </p>
                    ) : (
                      'No public proposals on this DAO yet.'
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
                              Math.max(activeCategoryProposalCount - 1, 0)
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
                      className={governanceCreateFieldTriggerClass(actionMenuOpen)}
                    >
                      <span>
                        {selectedActionOption?.label ?? activeProposalAction}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          actionMenuOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <FloatingPanelMenu
                      ref={actionMenuScrollRef}
                      open={actionMenuOpen}
                      align="full"
                      className={governanceCreateActionMenuShellClass}
                      onWheelCapture={handleActionMenuWheelCapture}
                      role="listbox"
                      aria-label="Proposal action"
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          setActionActiveIndex((current) =>
                            Math.min(
                              current + 1,
                              visibleSelectableProposalMenuItems.length - 1
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
                            Math.max(
                              visibleSelectableProposalMenuItems.length - 1,
                              0
                            )
                          );
                        } else if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectVisibleActionAtIndex(actionActiveIndex);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          closeActionDropdown();
                        } else if (event.key === 'Tab') {
                          closeActionDropdown();
                        }
                      }}
                    >
                      <GovernanceCreateActionCategoryStrip
                        categories={actionMenuCategories}
                        value={
                          visibleActionMenuCategory?.id ??
                          actionMenuCategories[0]?.id ??
                          ''
                        }
                        onChange={handleActionMenuCategoryChange}
                      />
                      <div className={governanceCreateActionMenuListClass}>
                        {visibleActionMenuItems.map((item) => {
                          if (item.kind === 'policy_link') {
                            return (
                              <GovernanceCreateActionPolicyLink
                                key={item.id}
                                label={item.label}
                                description={item.description}
                                href={item.href}
                                onClick={() => closeActionDropdown()}
                              />
                            );
                          }

                          const proposalIndex =
                            visibleSelectableProposalMenuItems.findIndex(
                              (option) => option.id === item.id
                            );
                          const selected = item.id === activeProposalAction;
                          const active = proposalIndex === actionActiveIndex;

                          return (
                            <GovernanceCreateActionMenuOption
                              key={item.id}
                              label={item.label}
                              description={item.description}
                              selected={selected}
                              active={active}
                              optionRef={(element) => {
                                actionOptionRefs.current[proposalIndex] = element;
                              }}
                              optionId={`governance-create-action-option-${proposalIndex}`}
                              tabIndex={active ? 0 : -1}
                              onClick={() =>
                                selectVisibleActionAtIndex(proposalIndex)
                              }
                              onMouseEnter={() =>
                                setActionActiveIndex(proposalIndex)
                              }
                            />
                          );
                        })}
                      </div>
                    </FloatingPanelMenu>
                  </div>
                ) : (
                  <div className={cn(governanceCreateFieldShellClass, 'px-4 py-3 text-sm font-medium md:py-3')}>
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
                      <div
                    className={cn(
                      governanceCreateFieldShellClass,
                      'px-4 py-3 text-sm text-muted-foreground md:py-3'
                    )}
                  >
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
                          className={governanceCreateFieldTriggerClass(roleMenuOpen)}
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
                      <div className={cn(governanceCreateFieldShellClass, 'px-4 py-3 text-sm font-medium md:py-3')}>
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
                          key={activeProposalAction}
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
                      <div className={cn(governanceCreateFieldShellClass, 'px-3 py-2.5 md:px-4')}>
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

              {isContractUpgradeAction ? (
                <div className="space-y-2">
                  <div>
                    <PortalFieldSelect
                      label="Contract"
                      value={contractUpgradeContractId}
                      options={upgradableContractOptions}
                      onChange={(nextContractId) => {
                        setContractUpgradeContractId(nextContractId);
                        setError('');
                      }}
                      disabled={
                        managedContractsLoading ||
                        hashUpgradableManagedContracts.length === 0
                      }
                      placeholder={
                        managedContractsLoading
                          ? 'Loading contracts…'
                          : 'No upgradable contracts'
                      }
                      ariaLabel="Contract to upgrade"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="governance-create-contract-upgrade-hash"
                      className={fieldLabelClass}
                    >
                      Published code hash
                    </label>
                    <div className={cn(governanceCreateFieldShellClass, 'px-3 py-2.5 md:px-4')}>
                      <input
                        id="governance-create-contract-upgrade-hash"
                        type="text"
                        value={contractUpgradeCodeHashInput}
                        onChange={(event) => {
                          setContractUpgradeCodeHashInput(event.target.value);
                          setError('');
                        }}
                        placeholder="Global WASM hash from near contract deploy-as-global"
                        disabled={!selectedUpgradableContract}
                        className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                    {contractUpgradeCodeHash ? (
                      <p
                        className={cn(
                          'mt-1.5 portal-type-caption',
                          contractUpgradeHashLookup === 'published'
                            ? 'text-emerald-600'
                            : contractUpgradeHashLookup === 'checking'
                              ? 'text-muted-foreground/70'
                              : contractUpgradeHashLookup === 'missing' ||
                                  contractUpgradeHashLookup === 'invalid'
                                ? 'text-amber-600'
                                : 'text-muted-foreground/70'
                        )}
                      >
                        {contractUpgradeHashLookup === 'checking'
                          ? 'Checking network for published WASM…'
                          : contractUpgradeHashLookup === 'published'
                            ? 'Hash is published on this network.'
                            : contractUpgradeHashLookup === 'missing'
                              ? 'Hash not found on this network — publish before proposing.'
                              : contractUpgradeHashLookup === 'invalid'
                                ? 'Could not verify this hash on the network.'
                                : null}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isContractConfigAction ? (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <PortalFieldSelect
                      label="Contract"
                      value={contractConfigContractId}
                      options={configurableContractOptions}
                      onChange={(nextContractId) => {
                        setContractConfigContractId(nextContractId);
                        setError('');
                      }}
                      disabled={
                        managedContractsLoading ||
                        configurableManagedContracts.length === 0
                      }
                      placeholder={
                        managedContractsLoading
                          ? 'Loading contracts…'
                          : 'No configurable contracts'
                      }
                      ariaLabel="Contract to configure"
                      compact
                    />
                    <PortalFieldSelect
                      label="Setting"
                      value={contractConfigOperationId}
                      options={contractConfigOperationOptions}
                      onChange={(nextOperationId) => {
                        setContractConfigOperationId(
                          nextOperationId as DaoContractConfigOperationId
                        );
                        setError('');
                      }}
                      disabled={
                        managedContractsLoading ||
                        contractConfigOperationOptions.length === 0
                      }
                      placeholder={
                        managedContractsLoading
                          ? 'Loading settings…'
                          : 'No settings for this contract'
                      }
                      ariaLabel="Contract setting"
                      compact
                    />
                  </div>
                  {routingFixedFieldsCaption ? (
                    <p className="portal-type-caption text-muted-foreground/70">
                      {routingFixedFieldsCaption}
                    </p>
                  ) : null}
                  {isSocialSpendActionRoutingOperationId(
                    contractConfigOperationId
                  ) && actionRoutingOperationConfig ? (
                    <SocialSpendActionRoutingFields
                      operationId={contractConfigOperationId}
                      actionLabel={actionRoutingOperationConfig.actionLabel}
                      draft={actionRoutingDraft}
                      baseline={actionRoutingBaseline}
                      loading={actionRoutingLoading}
                      loadError={actionRoutingLoadError}
                      onDraftChange={(nextDraft) => {
                        setActionRoutingDraft(nextDraft);
                        setError('');
                      }}
                      onReload={reloadActionRouting}
                      minAmountPolicy={
                        isSocialSpendRoutingMinEditableOperationId(
                          contractConfigOperationId
                        )
                          ? contractConfigOperationId
                          : null
                      }
                      editableActive={isSupportSpendRoutingOperationId(
                        contractConfigOperationId
                      )}
                    />
                  ) : contractConfigOperationId ===
                    'social_spend_set_season_config' ? (
                    <SocialSpendSeasonConfigFields
                      contractId={
                        selectedConfigurableContract?.contractId ?? ''
                      }
                      draft={seasonConfigDraft}
                      baseline={seasonConfigBaseline}
                      chainSeasonIds={seasonConfigChainSeasonIds}
                      loading={seasonConfigLoading}
                      refreshing={seasonConfigRefreshing}
                      loadError={seasonConfigLoadError}
                      onDraftChange={(nextDraft) => {
                        setSeasonConfigDraft(nextDraft);
                        setError('');
                      }}
                      onReload={reloadSeasonConfig}
                      onSelectExistingSeason={selectSeasonConfigSeason}
                      lookupReady={seasonConfigLookupReady}
                      hasOnChainConfig={seasonConfigHasOnChainConfig}
                    />
                  ) : null}
                </div>
              ) : null}

              {isFundSeasonPoolAction ? (
                <div className="space-y-2">
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
                        className={cn(
                          governanceCreateFieldShellClass,
                          'h-11 min-w-0 flex-1 px-4 text-sm outline-none placeholder:text-muted-foreground/50'
                        )}
                      />
                      {daoSocialBalance != null && daoSocialBalance > 0n ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 shrink-0 px-3 text-xs"
                          onClick={() => {
                            setSocialSpendAmountInput(
                              yoctoToSocial(
                                socialSpendTreasuryContext?.daoSocialBalanceYocto ??
                                  '0'
                              )
                            );
                            setError('');
                          }}
                        >
                          Full balance
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-1.5 portal-type-caption text-muted-foreground/70">
                      DAO SOCIAL balance:{' '}
                      {formatSocial(
                        socialSpendTreasuryContext?.daoSocialBalanceYocto ?? '0'
                      )}{' '}
                      SOCIAL
                    </p>
                    {socialSpendSeasonOptions.length === 0 ? (
                      <p className="mt-1 text-[11px] text-amber-600">
                        No live rally seasons on-chain right now.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isWithdrawBoostInfraAction ? (
                <div className="space-y-2">
                  <div>
                      <label
                        htmlFor="governance-create-boost-infra-amount"
                        className={fieldLabelClass}
                      >
                        Amount (SOCIAL)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="governance-create-boost-infra-amount"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={boostInfraAmountInput}
                          onChange={(event) => {
                            setBoostInfraAmountInput(
                              sanitizeTokenAmountInput(event.target.value, 18)
                            );
                            setError('');
                          }}
                          placeholder="0"
                          disabled={boostInfraLoading}
                          className={cn(
                          governanceCreateFieldShellClass,
                          'h-11 min-w-0 flex-1 px-4 text-sm outline-none placeholder:text-muted-foreground/50'
                        )}
                        />
                        {boostInfraPoolBalance != null &&
                        boostInfraPoolBalance > 0n ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 shrink-0 px-3 text-xs"
                            onClick={() => {
                              setBoostInfraAmountInput(
                                yoctoToSocial(
                                  boostInfraContext?.infraPoolYocto ?? '0'
                                )
                              );
                              setError('');
                            }}
                          >
                            Full balance
                          </Button>
                        ) : null}
                      </div>
                      {boostInfraContext?.infraPoolYocto ? (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          Infra pool:{' '}
                          {formatSmallestTokenAmount(
                            boostInfraContext.infraPoolYocto,
                            18
                          )}{' '}
                          SOCIAL
                          {boostInfraContext.defaultReceiverId ? (
                            <> → {boostInfraContext.defaultReceiverId}</>
                          ) : null}
                        </p>
                      ) : null}
                  </div>
                  {daoBoard === 'governance' &&
                  boostInfraContext?.canWithdrawBoostInfra ? (
                    <p className="text-[11px] text-muted-foreground/70">
                      Withdraw on the{' '}
                      <Link
                        href="/governance/create?dao=treasury"
                        className="text-[var(--portal-blue)] underline-offset-2 hover:underline"
                      >
                        Treasury DAO
                      </Link>{' '}
                      board when treasury is infra withdraw authority.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <GovernanceCreateProposalSummaryBlock summary={proposalSummary} />

              <div>
                <label
                  htmlFor="governance-create-description"
                  className={fieldLabelClass}
                >
                  {activeProposalAction === 'idea'
                    ? DAO_SIGNAL_PROPOSAL_LABEL
                    : 'Description'}
                </label>
                <div
                  className={cn(
                    'portal-field-focus relative rounded-2xl border bg-background/45',
                    descriptionCounter.invalidCharacters
                      ? 'border-[var(--portal-red-border)]'
                      : 'border-border/40'
                  )}
                >
                  <textarea
                    id="governance-create-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder={descriptionPlaceholder}
                    rows={3}
                    maxLength={PROPOSAL_DESCRIPTION_LIMITS.max}
                    className="w-full resize-none rounded-2xl bg-transparent px-4 pt-3 pb-7 text-sm outline-none placeholder:text-muted-foreground/50 md:pt-3.5"
                  />
                  <span
                    className={cn(
                      'pointer-events-none absolute right-3 bottom-2 portal-type-caption tabular-nums tracking-wide',
                      descriptionCounter.className
                    )}
                  >
                    {descriptionCounter.label}
                  </span>
                </div>
              </div>

              {showStickyCreateSubmit ? (
                <div className="sticky bottom-0 z-10 -mx-4 -mt-3 border-t border-fade-detail bg-background/92 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-xl md:hidden">
                  {submitFeedbackMessage ? (
                    <p className="mb-2 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {error ? (
                        <span className="portal-red-text">{error}</span>
                      ) : (
                        blockedReason
                      )}
                    </p>
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
                    {submitLabel}
                  </Button>
                </div>
              ) : null}

              {submitFeedbackMessage ? (
                <div className="hidden min-h-[1.25rem] text-sm text-muted-foreground md:block">
                  {error ? (
                    <p className="portal-red-text">{error}</p>
                  ) : (
                    <p>{blockedReason}</p>
                  )}
                </div>
              ) : null}

              <Button
                type="button"
                className="hidden h-11 w-full md:inline-flex"
                disabled={!canSubmit}
                loading={submitting}
                onClick={() => {
                  void handleSubmit();
                }}
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        )}
      </SurfacePanel>
    </>
  );
}
