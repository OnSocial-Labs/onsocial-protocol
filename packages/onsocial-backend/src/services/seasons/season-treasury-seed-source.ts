import { config } from '../../config/index.js';
import { loadAllDaoProposalSnapshots } from '../governance-dao-proposal-store.js';
import type { PersistedDaoProposalSnapshot } from '../governance-dao-proposal-store.js';
import { assertSeasonId } from './season-registry.js';

export type SeasonTreasurySeedSource =
  | {
      kind: 'proposal';
      appId: string;
      proposalId: number;
    }
  | {
      kind: 'tx';
      txHash: string;
    };

function readStringField(
  value: unknown,
  field: string
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function parseDaoActionArgs(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseFundSeasonPoolTransferMsg(msg: string | null): {
  seasonId: string | null;
  action: string | null;
} {
  if (!msg?.trim()) {
    return { seasonId: null, action: null };
  }

  try {
    const parsed = JSON.parse(msg) as Record<string, unknown>;
    const action = readStringField(parsed, 'action');
    const seasonId = readStringField(parsed, 'season_id');
    return { seasonId, action };
  } catch {
    return { seasonId: null, action: null };
  }
}

function readAmountYocto(args: Record<string, unknown> | null): string | null {
  if (!args) return null;

  const direct = readStringField(args, 'amount');
  if (direct && /^\d+$/.test(direct)) {
    return direct;
  }

  const wrapped = args.amount;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    const nested = readStringField(wrapped, '0');
    if (nested && /^\d+$/.test(nested)) {
      return nested;
    }
  }

  return null;
}

function getFunctionCallShape(kind: Record<string, unknown> | undefined): {
  receiverId: string | null;
  methodName: string | null;
  args: Record<string, unknown> | null;
} {
  const functionCall = kind?.FunctionCall;
  if (!functionCall || typeof functionCall !== 'object') {
    return { receiverId: null, methodName: null, args: null };
  }

  const receiverId = readStringField(functionCall, 'receiver_id');
  const actions =
    'actions' in functionCall && Array.isArray(functionCall.actions)
      ? functionCall.actions
      : [];
  const firstAction = actions[0];
  const methodName =
    firstAction &&
    typeof firstAction === 'object' &&
    'method_name' in firstAction &&
    typeof firstAction.method_name === 'string'
      ? firstAction.method_name
      : null;
  const args =
    firstAction &&
    typeof firstAction === 'object' &&
    'args' in firstAction &&
    typeof firstAction.args === 'string'
      ? parseDaoActionArgs(firstAction.args)
      : null;

  return { receiverId, methodName, args };
}

function resolveTokenContractId(): string {
  return config.nearNetwork === 'mainnet'
    ? 'token.onsocial.near'
    : 'token.onsocial.testnet';
}

/** Pure parser — exported for tests. */
export function parseFundSeasonPoolProposal(
  snapshot: Pick<PersistedDaoProposalSnapshot, 'kind'>
): { seasonId: string | null; amountYocto: string | null } | null {
  const { receiverId, methodName, args } = getFunctionCallShape(snapshot.kind);

  if (methodName === 'fund_season_pool_from_treasury') {
    const seasonId = readStringField(args, 'season_id');
    const amountYocto = readAmountYocto(args);
    return seasonId ? { seasonId, amountYocto } : null;
  }

  if (methodName === 'ft_transfer_call') {
    const msg = readStringField(args, 'msg');
    const parsedMsg = parseFundSeasonPoolTransferMsg(msg);
    if (parsedMsg.action !== 'fund_season_pool' || !parsedMsg.seasonId) {
      return null;
    }

    const tokenContractId = resolveTokenContractId();
    if (
      receiverId?.toLowerCase() !== tokenContractId.toLowerCase() &&
      receiverId?.toLowerCase() !== config.socialSpendContract.toLowerCase()
    ) {
      return null;
    }

    return {
      seasonId: parsedMsg.seasonId,
      amountYocto: readAmountYocto(args),
    };
  }

  return null;
}

function isApprovedProposalStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized === 'approved' || normalized === 'executed';
}

function buildProtocolProposalAppId(proposalId: number): string {
  return `protocol-proposal-${proposalId}`;
}

/** Pick the best fund-season proposal for a season pool sponsorship. */
export function resolveFundSeasonProposalSource(input: {
  seasonId: string;
  sponsoredPoolYocto?: string | bigint;
  proposals: Array<{
    proposalId: number;
    status: string;
    proposalSnapshot: PersistedDaoProposalSnapshot;
  }>;
}): SeasonTreasurySeedSource | null {
  const seasonId = assertSeasonId(input.seasonId);
  const sponsored =
    typeof input.sponsoredPoolYocto === 'bigint'
      ? input.sponsoredPoolYocto
      : BigInt(input.sponsoredPoolYocto ?? '0');

  let best: {
    proposalId: number;
    score: number;
  } | null = null;

  for (const row of input.proposals) {
    const parsed = parseFundSeasonPoolProposal(row.proposalSnapshot);
    if (!parsed || parsed.seasonId !== seasonId) {
      continue;
    }

    let score = row.proposalId;
    if (isApprovedProposalStatus(row.status)) {
      score += 1_000_000;
    }

    if (parsed.amountYocto) {
      try {
        const amount = BigInt(parsed.amountYocto);
        if (sponsored > 0n && amount === sponsored) {
          score += 500_000;
        } else if (sponsored > 0n && amount > 0n && amount <= sponsored) {
          score += 100_000;
        }
      } catch {
        // ignore invalid amount
      }
    }

    if (!best || score > best.score) {
      best = { proposalId: row.proposalId, score };
    }
  }

  if (!best) {
    return null;
  }

  return {
    kind: 'proposal',
    appId: buildProtocolProposalAppId(best.proposalId),
    proposalId: best.proposalId,
  };
}

export async function getSeasonTreasurySeedSource(
  seasonId: string,
  input: { sponsoredPoolYocto?: string | bigint } = {}
): Promise<SeasonTreasurySeedSource | null> {
  const sponsored =
    typeof input.sponsoredPoolYocto === 'bigint'
      ? input.sponsoredPoolYocto
      : BigInt(input.sponsoredPoolYocto ?? '0');

  if (sponsored <= 0n) {
    return null;
  }

  const id = assertSeasonId(seasonId);
  const snapshots = await loadAllDaoProposalSnapshots(config.governanceDao);

  return resolveFundSeasonProposalSource({
    seasonId: id,
    sponsoredPoolYocto: sponsored,
    proposals: snapshots.map((row) => ({
      proposalId: row.proposalId,
      status: row.status,
      proposalSnapshot: row.proposalSnapshot,
    })),
  });
}
