'use client';

import Link from 'next/link';
import { Shield, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DAO_GOVERNANCE_PERMISSION_IDS,
  DAO_GOVERNANCE_PERMISSION_OPTIONS,
  DAO_DELEGATED_ACTION_PERMISSIONS_PRESET,
  DAO_EDITABLE_PERMISSION_OPTIONS,
  DAO_IDEA_PROPOSAL_PERMISSION,
  DAO_SIGNAL_PROPOSAL_PERMISSION_HINT,
  DAO_FULL_PUBLIC_PERMISSIONS_PRESET,
  DAO_PUBLIC_PERMISSION_OPTIONS,
  buildDaoRolePermissionChips,
  daoPermissionSetsEqual,
  formatDaoPermissionPresetLabel,
  formatDaoRoleDisplayName,
  matchDaoPermissionPreset,
  resolveDaoRoleKind,
  roleHasWildcardPermissions,
  sortDaoPolicyRolesForDisplay,
  type DaoPolicyActionId,
  type DaoRoleKind,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoRole } from '@/features/governance/types';
import { useMemberAccountLookup } from '@/hooks/use-member-account-lookup';
import { getPortalProfileUrl } from '@/lib/portal-config';
import { yoctoToSocial } from '@/lib/near-rpc';
import {
  getBoundedNoteFieldCounter,
  POLICY_PROPOSAL_DESCRIPTION_LIMITS,
  type BoundedNoteLimits,
} from '@/lib/bounded-note-field';
import { cn } from '@/lib/utils';

const fieldLabelClass =
  'mb-2 block portal-type-label font-medium uppercase tracking-[0.16em] text-muted-foreground';

const roleKindBadgeLabel: Record<DaoRoleKind, string> = {
  council: 'Council',
  public: 'Public',
  gated: 'SOCIAL gate',
};

export function policyFieldShellClass(invalid?: boolean) {
  return cn(
    'portal-field-focus rounded-2xl border bg-background/45',
    invalid ? 'border-[var(--portal-red-border)]' : 'border-border/40'
  );
}

export function PolicyInlineFieldHint({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-1.5 text-[11px] leading-snug portal-red-text">{message}</p>
  );
}

export function PolicyActionForm({
  actionKey,
  children,
}: {
  actionKey: string;
  children: React.ReactNode;
}) {
  return (
    <div key={actionKey} className="space-y-2">
      {children}
    </div>
  );
}

function CouncilMemberAvatar({
  accountId,
  sizeClassName = 'h-7 w-7',
  stackIndex = 0,
}: {
  accountId: string;
  sizeClassName?: string;
  stackIndex?: number;
}) {
  const lookup = useMemberAccountLookup(accountId);

  return (
    <Link
      href={getPortalProfileUrl(accountId)}
      prefetch
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-full border-2 border-background bg-muted/30 shadow-none transition-opacity hover:opacity-90',
        sizeClassName,
        stackIndex > 0 && '-ml-2',
        lookup.checking && !lookup.avatarUrl && 'animate-pulse bg-muted/50'
      )}
      aria-label={lookup.displayName ?? accountId}
    >
      {lookup.avatarUrl ? (
        <img
          src={lookup.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <User className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      )}
    </Link>
  );
}

function RoleEditingBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border portal-blue-badge px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.12em]">
      Editing
    </span>
  );
}

function RoleTypeBadge({ kind }: { kind: DaoRoleKind }) {
  const isCouncil = kind === 'council';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]',
        isCouncil
          ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] portal-gold-text'
          : kind === 'gated'
            ? 'border-[var(--portal-purple-border)] bg-[var(--portal-purple-bg)] portal-purple-text'
            : 'border-border/50 bg-muted/20 text-muted-foreground'
      )}
    >
      {isCouncil ? (
        <Shield className="portal-gold-icon h-3 w-3" strokeWidth={2} />
      ) : (
        <Users className="h-3 w-3" strokeWidth={2} />
      )}
      {roleKindBadgeLabel[kind]}
    </span>
  );
}

function RolePermissionChip({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'gold' | 'blue';
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] leading-none',
        tone === 'gold'
          ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] portal-gold-text'
          : tone === 'blue'
            ? 'portal-blue-badge'
            : 'border-border/40 bg-background/60 text-muted-foreground'
      )}
    >
      {label}
    </span>
  );
}

function rolePermissionChipTone(
  role: GovernanceDaoRole,
  permissionId: string
): 'gold' | 'blue' | 'default' {
  if (roleHasWildcardPermissions(role)) {
    return 'gold';
  }

  if (resolveDaoRoleKind(role) === 'council') {
    return 'gold';
  }

  if (DAO_GOVERNANCE_PERMISSION_IDS.has(permissionId)) {
    return 'blue';
  }

  return 'default';
}

function rolePermissionChips(role: GovernanceDaoRole): Array<{
  key: string;
  label: string;
  tone: 'gold' | 'blue' | 'default';
}> {
  return buildDaoRolePermissionChips(role).map((chip) => ({
    ...chip,
    tone:
      chip.tone === 'gold' || chip.tone === 'blue'
        ? chip.tone
        : rolePermissionChipTone(role, chip.key),
  }));
}

export function PolicyRoleListShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/45 divide-y divide-fade-detail">
      {children}
    </div>
  );
}

const proposeKindShellClass =
  'overflow-hidden rounded-2xl border border-border/40 bg-background/45';

const segmentedBarClass =
  'grid grid-cols-2 gap-0.5 bg-muted/10 p-1.5 sm:flex sm:flex-wrap';

const proposeKindSegmentClass = (active: boolean) =>
  cn(
    'h-8 min-w-0 rounded-lg px-2 text-[10px] font-medium transition-transform active:scale-[0.98] sm:min-w-[4.5rem] sm:flex-1',
    active
      ? 'shadow-sm'
      : 'border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground'
  );

export function PolicyProposeKindPills({
  value,
  options,
  onChange,
}: {
  value: DaoPolicyActionId;
  options: Array<{ id: DaoPolicyActionId; label: string }>;
  onChange: (id: DaoPolicyActionId) => void;
}) {
  return (
    <div
      className={proposeKindShellClass}
      role="group"
      aria-label="Policy proposal kind"
    >
      <div className={segmentedBarClass}>
        {options.map((option) => {
          const active = value === option.id;

          return (
            <Button
              key={option.id}
              type="button"
              variant={active ? 'default' : 'ghost'}
              size="xs"
              className={proposeKindSegmentClass(active)}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function DaoRoleSnapshotCard({
  role,
  editingHighlight = false,
  selectable = false,
  onSelect,
}: {
  role: GovernanceDaoRole;
  editingHighlight?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
}) {
  const name = role.name?.trim();
  if (!name) return null;

  const roleKind = resolveDaoRoleKind(role);
  const isCouncil = roleKind === 'council';
  const displayName = formatDaoRoleDisplayName(name);
  const members = role.kind?.Group ?? [];
  const memberThreshold = role.kind?.Member;
  const permissionChips = rolePermissionChips(role);

  const meta = members.length
    ? `${members.length} member${members.length === 1 ? '' : 's'}`
    : memberThreshold
      ? `≥${formatSocialThreshold(memberThreshold)} SOCIAL`
      : roleKind === 'public'
        ? 'Open membership'
        : '—';

  const chips = permissionChips;

  const content = (
    <div className="flex items-center gap-2">
      {members.length > 0 ? (
        <div className="flex shrink-0 items-center">
          {members.slice(0, 3).map((memberId, index) => (
            <CouncilMemberAvatar
              key={memberId}
              accountId={memberId}
              sizeClassName="h-5 w-5"
              stackIndex={index}
            />
          ))}
        </div>
      ) : (
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted/20',
            isCouncil
              ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)]'
              : 'border-border/50'
          )}
        >
          {isCouncil ? (
            <Shield className="portal-gold-icon h-2.5 w-2.5" strokeWidth={2} />
          ) : (
            <Users className="h-2.5 w-2.5" strokeWidth={2} />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-[13px] font-medium leading-tight">
              {displayName}
              {displayName.localeCompare(name, undefined, {
                sensitivity: 'accent',
              }) !== 0 ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {name}
                </span>
              ) : null}
            </p>
            {editingHighlight ? <RoleEditingBadge /> : null}
          </div>
          <RoleTypeBadge kind={roleKind} />
        </div>
        <div className="mt-px flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
          <span className="text-[10px] text-muted-foreground">{meta}</span>
          {chips.length > 0 ? (
            <>
              <span
                aria-hidden
                className="text-[10px] text-muted-foreground/35"
              >
                ·
              </span>
              {chips.map((chip) => (
                <RolePermissionChip
                  key={chip.key}
                  label={chip.label}
                  tone={chip.tone}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (selectable && onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={editingHighlight}
        className={cn(
          'portal-field-focus w-full px-4 py-2.5 text-left transition-colors',
          editingHighlight
            ? 'bg-[var(--portal-neutral-bg)]'
            : 'hover:bg-[var(--portal-neutral-bg)] focus-visible:bg-[var(--portal-neutral-bg)]'
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'px-4 py-2.5',
        editingHighlight && 'bg-[var(--portal-neutral-bg)]'
      )}
    >
      {content}
    </div>
  );
}

function formatSocialThreshold(value: string): string {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 0,
  }).format(numeric);
}

export function DaoRoleSnapshotList({
  roles,
  selectedRoleId,
  editableRoleIds,
  onRoleSelect,
}: {
  roles: GovernanceDaoRole[];
  selectedRoleId?: string;
  editableRoleIds?: string[];
  onRoleSelect?: (roleId: string) => void;
}) {
  const editableSet = new Set(editableRoleIds ?? []);
  const sortedRoles = sortDaoPolicyRolesForDisplay(roles);
  const permissionsEditingActive = Boolean(onRoleSelect);
  const canSwitchEditableRoles = (editableRoleIds?.length ?? 0) > 1;

  return (
    <div className="divide-y divide-fade-detail">
      {sortedRoles.map((role) => {
        const name = role.name?.trim();
        if (!name) return null;

        const isEditable = editableSet.has(name);
        const editingHighlight =
          permissionsEditingActive && isEditable && selectedRoleId === name;
        const selectable =
          permissionsEditingActive && isEditable && canSwitchEditableRoles;

        return (
          <DaoRoleSnapshotCard
            key={name}
            role={role}
            editingHighlight={editingHighlight}
            selectable={selectable}
            onSelect={
              selectable
                ? () => {
                    if (selectedRoleId === name) {
                      return;
                    }
                    onRoleSelect?.(name);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function DaoRoleSnapshotListSkeleton({
  count = 2,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('divide-y divide-fade-detail', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="h-5 w-5 shrink-0 rounded-full bg-foreground/[0.06]" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-28 rounded-md bg-foreground/[0.06]" />
              <Skeleton className="h-4 w-14 rounded-full bg-foreground/[0.06]" />
            </div>
            <Skeleton className="h-3 w-36 rounded-md bg-foreground/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

const permissionPickerShellClass =
  'overflow-hidden rounded-2xl border border-border/40 bg-background/45';

const presetSegmentClass = (active: boolean, spansRowOnMobile = false) =>
  cn(
    'h-7 min-w-0 rounded-lg px-2 text-[10px] font-medium transition-transform active:scale-[0.98] sm:min-w-[5.5rem] sm:flex-1',
    spansRowOnMobile && 'col-span-2 sm:col-span-1',
    active
      ? 'shadow-sm'
      : 'border-transparent bg-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground'
  );

const permissionPillClass = (active: boolean) =>
  cn(
    'h-7 w-full justify-center px-2 text-[10px] font-medium transition-transform active:scale-[0.98]',
    active ? 'shadow-sm' : 'border-border/35 bg-background/40'
  );

const governancePillClass = (active: boolean) =>
  cn(
    'h-7 w-full justify-center px-2 text-[10px] font-medium transition-transform active:scale-[0.98]',
    active
      ? 'portal-blue-surface border-[var(--portal-blue-border-strong)] portal-blue-text shadow-sm'
      : 'border-border/35 bg-background/40 text-muted-foreground'
  );

export function DaoPermissionPicker({
  permissions,
  onChange,
  baselinePermissions,
  baselinePresetPermissions,
  compact = false,
}: {
  permissions: string[];
  onChange: (next: string[]) => void;
  /** Granular permissions restored by the Current pill. */
  baselinePermissions?: string[];
  /** Raw on-chain permissions — used for the Current preset label. */
  baselinePresetPermissions?: string[];
  compact?: boolean;
}) {
  const baseline = baselinePermissions ?? [];

  const applyPreset = (preset: readonly string[]) => {
    const governance = permissions.filter((permission) =>
      DAO_GOVERNANCE_PERMISSION_IDS.has(permission)
    );
    onChange([...preset, ...governance]);
  };

  const restoreBaseline = () => {
    onChange([...baseline]);
  };

  const togglePermission = (permissionId: string) => {
    const isActive = permissions.includes(permissionId);
    if (isActive && permissions.length <= 1) {
      return;
    }

    onChange(
      isActive
        ? permissions.filter((id) => id !== permissionId)
        : [...permissions, permissionId]
    );
  };

  const isSolePermission = (permissionId: string) =>
    permissions.length === 1 && permissions[0] === permissionId;

  const baselinePresetLabel = formatDaoPermissionPresetLabel(
    matchDaoPermissionPreset(baselinePresetPermissions ?? baseline)
  );
  const matchesBaseline = daoPermissionSetsEqual(permissions, baseline);
  const matchesFullPublic = daoPermissionSetsEqual(
    permissions,
    DAO_FULL_PUBLIC_PERMISSIONS_PRESET
  );
  const matchesActionsOnly = daoPermissionSetsEqual(
    permissions,
    DAO_DELEGATED_ACTION_PERMISSIONS_PRESET
  );

  const signalHint = DAO_SIGNAL_PROPOSAL_PERMISSION_HINT;

  const renderPermissionToggle = (
    option: { id: string; label: string },
    tone: 'public' | 'governance'
  ) => {
    const active = permissions.includes(option.id);
    const locked = isSolePermission(option.id);
    const isSignal = option.id === DAO_IDEA_PROPOSAL_PERMISSION;
    const className =
      tone === 'governance'
        ? governancePillClass(active)
        : permissionPillClass(active);

    return (
      <Button
        key={option.id}
        type="button"
        variant={
          tone === 'governance' ? 'outline' : active ? 'default' : 'outline'
        }
        size="xs"
        className={cn(className, locked && 'cursor-default opacity-90')}
        title={
          locked
            ? 'At least one permission is required'
            : isSignal
              ? signalHint
              : undefined
        }
        onClick={() => togglePermission(option.id)}
      >
        {option.label}
      </Button>
    );
  };

  const picker = (
    <div className={permissionPickerShellClass}>
      <div
        className={cn(segmentedBarClass, 'border-b border-fade-detail')}
        role="group"
        aria-label="Permission presets"
      >
        {baseline.length > 0 ? (
          <Button
            type="button"
            variant={matchesBaseline ? 'default' : 'ghost'}
            size="xs"
            className={presetSegmentClass(matchesBaseline, true)}
            onClick={restoreBaseline}
          >
            Reset
            <span className="sr-only">
              {matchesBaseline
                ? ` · on-chain ${baselinePresetLabel}`
                : ` · restore on-chain ${baselinePresetLabel}`}
            </span>
          </Button>
        ) : null}
        <Button
          type="button"
          variant={
            matchesFullPublic && !matchesBaseline ? 'default' : 'ghost'
          }
          size="xs"
          className={presetSegmentClass(
            matchesFullPublic && !matchesBaseline
          )}
          onClick={() => applyPreset(DAO_FULL_PUBLIC_PERMISSIONS_PRESET)}
        >
          All public
        </Button>
        <Button
          type="button"
          variant={
            matchesActionsOnly && !matchesBaseline ? 'default' : 'ghost'
          }
          size="xs"
          className={presetSegmentClass(
            matchesActionsOnly && !matchesBaseline
          )}
          onClick={() => applyPreset(DAO_DELEGATED_ACTION_PERMISSIONS_PRESET)}
        >
          Actions only
        </Button>
      </div>

      <div className="space-y-2 p-2">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          {DAO_PUBLIC_PERMISSION_OPTIONS.map((option) =>
            renderPermissionToggle(option, 'public')
          )}
        </div>
        <div className="space-y-1 border-t border-fade-detail pt-2">
          <p
            className="portal-eyebrow px-0.5 text-[9px] text-muted-foreground/70"
            title="Permissions to propose policy changes"
          >
            Policy
          </p>
          <div className="grid grid-cols-2 gap-1">
            {DAO_GOVERNANCE_PERMISSION_OPTIONS.map((option) =>
              renderPermissionToggle(option, 'governance')
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return picker;
  }

  return (
    <div className="space-y-1.5">
      <p className={fieldLabelClass}>Permissions</p>
      {picker}
    </div>
  );
}

export function PolicyProposalDescription({
  id,
  value,
  onChange,
  limits = POLICY_PROPOSAL_DESCRIPTION_LIMITS,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  limits?: BoundedNoteLimits;
}) {
  const counter = getBoundedNoteFieldCounter(value, limits);

  return (
    <div>
      <label htmlFor={id} className={fieldLabelClass}>
        Description
      </label>
      <div
        className={cn(
          'portal-field-focus relative rounded-2xl border bg-background/45',
          counter.invalidCharacters
            ? 'border-[var(--portal-red-border)]'
            : 'border-border/40'
        )}
      >
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          maxLength={limits.max}
          placeholder="What this policy change does"
          className="w-full resize-none rounded-2xl bg-transparent px-4 pt-3 pb-7 text-sm outline-none placeholder:text-muted-foreground/50 md:pt-3.5"
        />
        <span
          className={cn(
            'pointer-events-none absolute right-3 bottom-2 portal-type-caption tabular-nums tracking-wide',
            counter.className
          )}
        >
          {counter.label}
        </span>
      </div>
    </div>
  );
}
