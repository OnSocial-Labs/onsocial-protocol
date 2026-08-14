import type { ProtocolDaoProposal } from '@/features/protocol/types';

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function decodeBase64JsonArgs(value: string): unknown {
  try {
    const decoded =
      typeof atob === 'function'
        ? atob(value)
        : Buffer.from(value, 'base64').toString('utf8');
    return JSON.parse(decoded) as unknown;
  } catch {
    return value;
  }
}

function decodeFunctionCallKindForDisplay(
  kind: Record<string, unknown>
): Record<string, unknown> {
  const functionCall = kind.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return kind;
  }

  const record = functionCall as Record<string, unknown>;
  const actions =
    'actions' in record && Array.isArray(record.actions)
      ? record.actions.map((action) => {
          if (!action || typeof action !== 'object') {
            return action;
          }

          const actionRecord = action as Record<string, unknown>;
          if (
            !('args' in actionRecord) ||
            typeof actionRecord.args !== 'string'
          ) {
            return action;
          }

          return {
            ...actionRecord,
            args: decodeBase64JsonArgs(actionRecord.args),
          };
        })
      : record.actions;

  return {
    ...kind,
    FunctionCall: {
      ...record,
      actions,
    },
  };
}

/** Human-readable DAO proposal JSON (decoded FunctionCall args). */
export function formatProtocolDaoProposalForRawDisplay(
  liveProposal: ProtocolDaoProposal,
  liveProposalId: number | null
): string {
  const kind =
    liveProposal.kind && typeof liveProposal.kind === 'object'
      ? decodeFunctionCallKindForDisplay(liveProposal.kind)
      : liveProposal.kind;

  return safeJsonStringify({
    id: liveProposalId ?? liveProposal.id ?? null,
    proposer: liveProposal.proposer,
    description: liveProposal.description,
    status: liveProposal.status,
    kind,
    vote_counts: liveProposal.vote_counts,
    votes: liveProposal.votes,
    submission_time: liveProposal.submission_time,
    resolved_at: liveProposal.resolved_at ?? null,
    ...(liveProposal.policy_snapshot
      ? { policy_snapshot: liveProposal.policy_snapshot }
      : {}),
  });
}
