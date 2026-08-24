import type { NearAccountStatus } from '@/hooks/use-near-account-status';
import { isProtocolNearAccountFieldReady } from '@/features/protocol/protocol-compose-near-account-field';
import type { ProtocolDaoTransferAsset } from '@/lib/protocol-dao-transfer-assets';
import { tokenAmountToSmallestUnit } from '@/lib/app-near-rpc';

/** ChoiceDrawerField value for native NEAR — empty `token_id` on-chain. */
export const PROTOCOL_TRANSFER_NATIVE_NEAR_OPTION = '__native_near__';

export function protocolTransferAssetOptionValue(tokenId: string): string {
  return tokenId.trim() === '' ? PROTOCOL_TRANSFER_NATIVE_NEAR_OPTION : tokenId;
}

export function protocolTransferTokenIdFromOptionValue(
  optionValue: string
): string {
  return optionValue === PROTOCOL_TRANSFER_NATIVE_NEAR_OPTION ? '' : optionValue;
}

/** Human-readable DAO treasury balance for transfer asset meta / Max. */
export function formatProtocolTransferAssetAmount(
  balanceSmallest: string,
  decimals: number
): string {
  if (!balanceSmallest || balanceSmallest === '0') return '0';
  const safeDecimals = Math.max(0, Math.floor(decimals));
  if (safeDecimals === 0) {
    return balanceSmallest.replace(/^0+/, '') || '0';
  }

  const padded = balanceSmallest.padStart(safeDecimals + 1, '0');
  const whole = padded.slice(0, padded.length - safeDecimals) || '0';
  const fraction = padded
    .slice(padded.length - safeDecimals)
    .replace(/0+$/, '')
    .slice(0, 6);
  return fraction ? `${whole}.${fraction}` : whole;
}

export function resolveProtocolTransferAsset(
  assets: readonly ProtocolDaoTransferAsset[],
  tokenId: string
): ProtocolDaoTransferAsset | null {
  return (
    assets.find((asset) => asset.tokenId === tokenId) ?? assets[0] ?? null
  );
}

export function protocolCreateTransferAmountReady(
  amountInput: string,
  opts: {
    decimals: number;
    balanceSmallest: string;
  }
): boolean {
  const trimmed = amountInput.trim();
  if (!trimmed) return false;

  try {
    const amountSmallest = tokenAmountToSmallestUnit(trimmed, opts.decimals);
    if (amountSmallest === '0') return false;
    return BigInt(amountSmallest) <= BigInt(opts.balanceSmallest || '0');
  } catch {
    return false;
  }
}

export function protocolCreateTransferReady(
  asset: ProtocolDaoTransferAsset | null,
  receiverStatus: NearAccountStatus,
  receiverId: string,
  amountInput: string
): boolean {
  if (!asset) return false;
  if (
    !isProtocolNearAccountFieldReady(receiverStatus, receiverId, {
      requireOnChain: false,
    })
  ) {
    return false;
  }

  return protocolCreateTransferAmountReady(amountInput, {
    decimals: asset.decimals,
    balanceSmallest: asset.balanceSmallest,
  });
}

export function resolveProtocolTransferAmountYocto(
  amountInput: string,
  asset: ProtocolDaoTransferAsset
): string {
  if (
    protocolCreateTransferAmountReady(amountInput, {
      decimals: asset.decimals,
      balanceSmallest: asset.balanceSmallest,
    })
  ) {
    return tokenAmountToSmallestUnit(amountInput.trim(), asset.decimals);
  }

  const trimmed = amountInput.trim();
  if (!trimmed) {
    throw new Error('Enter a valid transfer amount.');
  }

  try {
    const amountSmallest = tokenAmountToSmallestUnit(trimmed, asset.decimals);
    if (amountSmallest === '0') {
      throw new Error('Enter a valid transfer amount.');
    }
  } catch {
    throw new Error('Enter a valid transfer amount.');
  }

  throw new Error(`Amount exceeds the DAO ${asset.symbol} balance.`);
}
