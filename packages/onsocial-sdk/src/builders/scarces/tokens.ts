// ---------------------------------------------------------------------------
// Pure builders for token-level scarces actions
// (mint, transfer, batch transfer, burn).
// ---------------------------------------------------------------------------

import type { MintOptions } from '../../types.js';
import { buildTokenMetadata } from './_shared.js';

export function buildQuickMintAction(opts: MintOptions) {
  return {
    type: 'quick_mint' as const,
    metadata: buildTokenMetadata(opts),
    ...(opts.royalty ? { royalty: opts.royalty } : {}),
    ...(opts.appId ? { app_id: opts.appId } : {}),
  };
}

export function buildTransferScarceAction(
  tokenId: string,
  receiverId: string,
  memo?: string
) {
  return {
    type: 'transfer_scarce' as const,
    token_id: tokenId,
    receiver_id: receiverId,
    ...(memo ? { memo } : {}),
  };
}

export interface BatchTransferEntry {
  receiver_id: string;
  token_id: string;
  memo?: string;
}

export function buildBatchTransferAction(transfers: BatchTransferEntry[]) {
  return {
    type: 'batch_transfer' as const,
    transfers,
  };
}

export function buildBurnScarceAction(tokenId: string, collectionId?: string) {
  return {
    type: 'burn_scarce' as const,
    token_id: tokenId,
    ...(collectionId ? { collection_id: collectionId } : {}),
  };
}
