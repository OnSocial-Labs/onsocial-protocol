'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Settings2, User } from 'lucide-react';
import { SectionHeader } from '@/components/layout/section-header';
import { Button } from '@/components/ui/button';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import {
  CompactActionSkeleton,
  StatStripSkeleton,
} from '@/components/ui/skeleton';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { InsetDividerItem } from '@/components/ui/inset-divider-group';
import { useWallet } from '@/contexts/wallet-context';
import { useDropdown } from '@/hooks/use-dropdown';
import {
  fetchDaoPolicy,
  submitDaoProposal,
} from '@/features/governance/api';
import {
  buildDaoMemberProposalPayload,
  buildProtocolProposalAppId,
  CREATABLE_DAO_MEMBERSHIP_PROPOSAL_OPTIONS,
  canProposeDaoKind,
  canProposePolicyChange,
  getCreatableDaoRoleOptions,
  getDaoKindPermissionBlockReason,
  getProposalKindBlockReason,
  resolveCreatableProposalKinds,
  type CreatableDaoProposalKind,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import { buildGovernanceProposalPath } from '@/features/governance/page-utils';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { useMemberAccountLookup } from '@/hooks/use-member-account-lookup';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  GOVERNANCE_DAO_ACCOUNT,
} from '@/lib/portal-config';
import {
  getGovernanceEligibility,
  getGovernanceProposalBond,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';

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

export function GovernanceCreatePanel() {
  const router = useRouter();
  const { accountId, connect, wallet, isConnected } = useWallet();
  const { txResult, clearTxResult, setTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const [proposalKind, setProposalKind] =
    useState<CreatableDaoProposalKind>('join_role');
  const [roleId, setRoleId] = useState('');
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
        getGovernanceEligibility(accountId),
        getGovernanceProposalBond(),
        fetchDaoPolicy(),
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
  }, [accountId]);

  useEffect(() => {
    setEligibility(null);
    setError('');
    void loadContext();
  }, [accountId, loadContext]);

  const memberAccountId = accountId ?? '';
  const memberLookup = useMemberAccountLookup(memberAccountId);

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
  const availableProposalKinds = useMemo(
    () => resolveCreatableProposalKinds(daoPolicy, roleId, memberAccountId),
    [daoPolicy, memberAccountId, roleId]
  );
  const membershipBlockReason = useMemo(
    () =>
      getProposalKindBlockReason(
        proposalKind,
        daoPolicy,
        roleId,
        memberAccountId
      ),
    [daoPolicy, memberAccountId, proposalKind, roleId]
  );
  const proposalKindAllowed = availableProposalKinds.includes(proposalKind);
  const canProposeMembershipKind =
    !!eligibility &&
    !!memberAccountId &&
    canProposeDaoKind(
      daoPolicy,
      memberAccountId,
      eligibility.delegatedWeight,
      proposalKind
    );
  const canSubmit =
    isConnected &&
    eligibility?.canPropose &&
    canCoverBond &&
    roleId.trim().length > 0 &&
    Boolean(memberAccountId) &&
    memberLookup.exists &&
    proposalKindAllowed &&
    canProposeMembershipKind &&
    !submitting;

  const blockedReason = useMemo(() => {
    if (!isConnected) return 'Connect wallet to submit a proposal.';
    if (!eligibility) return '';
    if (!eligibility.canPropose) {
      return `Delegate ${formatSocial(eligibility.remainingToThreshold ?? '0')} more SOCIAL to reach the proposal threshold.`;
    }
    if (!canCoverBond) {
      return `Add ${bondDisplay} NEAR to your wallet for the proposal bond.`;
    }
    if (membershipBlockReason) {
      return membershipBlockReason;
    }
    if (
      eligibility.canPropose &&
      memberAccountId &&
      !canProposeMembershipKind
    ) {
      return getDaoKindPermissionBlockReason(proposalKind);
    }
    return '';
  }, [
    bondDisplay,
    canCoverBond,
    canProposeMembershipKind,
    eligibility,
    isConnected,
    memberAccountId,
    membershipBlockReason,
    proposalKind,
  ]);

  useEffect(() => {
    if (availableProposalKinds.length === 0) {
      return;
    }

    if (!availableProposalKinds.includes(proposalKind)) {
      setProposalKind(availableProposalKinds[0]);
    }
  }, [availableProposalKinds, proposalKind]);

  const handleSubmit = useCallback(async () => {
    if (!wallet || !accountId) {
      await connect();
      return;
    }

    const membershipReason = getProposalKindBlockReason(
      proposalKind,
      daoPolicy,
      roleId,
      memberAccountId
    );
    const permissionReason =
      eligibility && memberAccountId && !canProposeDaoKind(
        daoPolicy,
        memberAccountId,
        eligibility.delegatedWeight,
        proposalKind
      )
        ? getDaoKindPermissionBlockReason(proposalKind)
        : '';

    if (permissionReason) {
      setError(permissionReason);
      return;
    }

    if (membershipReason) {
      setError(membershipReason);
      return;
    }

    if (!canSubmit) {
      setError(blockedReason || 'Complete the form before submitting.');
      return;
    }

    if (proposalKind !== 'join_role' && proposalKind !== 'leave_role') {
      setError('Only join and leave membership proposals can be submitted here.');
      return;
    }

    setError('');
    clearTxResult();
    setSubmitting(true);

    try {
      const payload = buildDaoMemberProposalPayload({
        kind: proposalKind,
        memberId: memberAccountId,
        roleId,
        description: description.trim() || undefined,
      });

      const { proposalId, txHash } = await submitDaoProposal(
        wallet,
        accountId,
        payload
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
          buildGovernanceProposalPath(
            buildProtocolProposalAppId(proposalId),
            proposalId
          )
        );
        return;
      }

      router.push('/governance?lane=protocol');
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
    daoPolicy,
    description,
    eligibility,
    memberAccountId,
    proposalKind,
    roleId,
    router,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const daoAccountId =
    eligibility?.daoAccountId ?? GOVERNANCE_DAO_ACCOUNT;
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

  useEffect(() => {
    if (!roleMenuOpen) {
      return;
    }

    roleOptionRefs.current[roleActiveIndex]?.focus();
  }, [roleActiveIndex, roleMenuOpen]);

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
                href={`${ACTIVE_NEAR_EXPLORER_URL}/address/${daoAccountId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono portal-blue-text transition-colors hover:text-[var(--portal-blue)]"
              >
                @{daoAccountId}
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
                    <Link href="/governance/policy" aria-label="Open DAO policy">
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
              Connect wallet to continue.
            </p>
            <Button
              type="button"
              className="mt-3 h-11"
              onClick={() => {
                void connect();
              }}
            >
              Connect wallet
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
            <CompactActionSkeleton className="mt-3 pt-3" tabCount={2} />
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
                  eligibility?.canPropose
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
              <StatStripCell label="Bond" value={`${bondDisplay} NEAR`} size="sm" />
            </StatStrip>

            {!eligibility?.canPropose ? (
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
              <div className="flex flex-wrap gap-2">
                {CREATABLE_DAO_MEMBERSHIP_PROPOSAL_OPTIONS.map((option) => {
                  const active = proposalKind === option.kind;
                  const allowed = availableProposalKinds.includes(option.kind);

                  return (
                    <Button
                      key={option.kind}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="xs"
                      disabled={!allowed}
                      onClick={() => {
                        setProposalKind(option.kind);
                        setError('');
                      }}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>

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
                          openRoleDropdown(Math.max(selectedRoleIndex - 1, 0));
                        } else if (event.key === 'Enter' || event.key === ' ') {
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
                        } else if (event.key === 'Enter' || event.key === ' ') {
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
                              {selected ? <Check className="h-4 w-4" /> : null}
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

              <div>
                <p className={fieldLabelClass}>You</p>
                <div
                  id="governance-create-member"
                  className="portal-field-focus flex min-w-0 items-center rounded-2xl border border-border/40 bg-background/45"
                >
                  <InsetDividerItem
                    showDivider
                    className="flex shrink-0 items-center py-2 pl-3 pr-3"
                  >
                    <span
                      className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted/30 text-muted-foreground transition-opacity ${
                        memberLookup.checking ? 'opacity-60' : ''
                      }`}
                    >
                      {memberLookup.exists && memberLookup.avatarUrl ? (
                        <img
                          src={memberLookup.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </span>
                  </InsetDividerItem>
                  <span className="min-w-0 flex-1 truncate px-4 py-3 font-mono text-sm font-medium md:py-3.5 md:text-base">
                    {memberAccountId}
                  </span>
                  <span className="shrink-0 pr-3">
                    {memberLookup.checking ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                        <PulsingDots size="sm" />
                      </span>
                    ) : memberLookup.exists ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="governance-create-description"
                  className={fieldLabelClass}
                >
                  Description
                </label>
                <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-3 md:px-4 md:py-3.5">
                  <textarea
                    id="governance-create-description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setError('');
                    }}
                    rows={2}
                    placeholder="Optional"
                    className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
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
                {proposalKind === 'join_role' ? 'Propose join' : 'Propose leave'}
              </Button>
            </div>
          </div>
        )}
      </SurfacePanel>
    </>
  );
}
