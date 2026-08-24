'use client';

import { useMemo } from 'react';
import { NearAccountField } from '@/components/ui/near-account-field';
import {
  nearAccountStatusClass,
  type NearAccountStatus,
} from '@/hooks/use-near-account-status';
import {
  getNearAccountInputError,
  nearAccountPlaceholder,
} from '@/lib/app-near-account';

export function protocolNearAccountFieldIssue(
  status: NearAccountStatus,
  value: string,
  opts?: { requireOnChain?: boolean }
): string | null {
  if (status === 'idle' || status === 'checking') {
    return null;
  }
  if (status === 'invalid') {
    return getNearAccountInputError(value) || 'Use a complete NEAR account.';
  }
  if (status === 'missing' && opts?.requireOnChain !== false) {
    return 'No NEAR account found with that id.';
  }
  return null;
}

export function isProtocolNearAccountFieldReady(
  status: NearAccountStatus,
  value: string,
  opts?: { requireOnChain?: boolean }
): boolean {
  if (!value.trim()) return false;
  if (status === 'idle' || status === 'checking') return false;
  if (status === 'invalid') return false;
  if (opts?.requireOnChain === false) {
    return status === 'found' || status === 'missing';
  }
  return status === 'found';
}

export function ProtocolComposeNearAccountField({
  id,
  label,
  value,
  status,
  onValueChange,
  disabled = false,
  requireOnChain = true,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  status: NearAccountStatus;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Add-member flows require a live NEAR account; remove only needs valid id. */
  requireOnChain?: boolean;
  /** Fixed destination — show account chrome without editing. */
  readOnly?: boolean;
}) {
  const statusClass = nearAccountStatusClass(status);
  const issue = useMemo(
    () => protocolNearAccountFieldIssue(status, value, { requireOnChain }),
    [requireOnChain, status, value]
  );
  const issueId = `${id}-issue`;

  return (
    <label className="guild-field">
      <span>{label}</span>
      <NearAccountField
        id={id}
        value={value}
        onValueChange={onValueChange}
        placeholder={nearAccountPlaceholder()}
        status={status}
        statusClass={statusClass}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={Boolean(issue)}
      />
      {issue ? (
        <span id={issueId} className="sr-only">
          {issue}
        </span>
      ) : null}
    </label>
  );
}
