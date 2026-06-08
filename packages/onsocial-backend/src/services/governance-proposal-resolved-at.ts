import { getBackendNearRpc } from './near-rpc-client.js';
import {
  isTerminalDaoProposalStatus,
  readProposalLastActionBlockHeight,
  readProposalSubmissionBlockHeight,
} from './governance-proposal-policy-snapshot.js';

async function loadBlockTimestampNanoseconds(
  blockHeight: number
): Promise<string | null> {
  if (!Number.isFinite(blockHeight) || blockHeight <= 0) {
    return null;
  }

  try {
    const response = await getBackendNearRpc().call<{
      header?: { timestamp?: number };
    }>('block', {
      block_id: blockHeight,
    });
    const timestamp = response.result?.header?.timestamp;
    if (typeof timestamp !== 'number' || timestamp <= 0) {
      return null;
    }

    return String(timestamp);
  } catch {
    return null;
  }
}

export async function resolveProposalResolvedAt(proposal: {
  status?: string;
  last_actions_log?: Array<{ block_height?: string | number }>;
}): Promise<string | null> {
  if (!isTerminalDaoProposalStatus(proposal.status)) {
    return null;
  }

  const submissionBlock = readProposalSubmissionBlockHeight(proposal);
  const lastActionBlock = readProposalLastActionBlockHeight(proposal);

  if (
    submissionBlock === null ||
    lastActionBlock === null ||
    lastActionBlock <= submissionBlock
  ) {
    return null;
  }

  return loadBlockTimestampNanoseconds(lastActionBlock);
}
