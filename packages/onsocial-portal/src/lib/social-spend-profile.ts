import { ACTIVE_NEAR_NETWORK } from '@/lib/portal-config';
import {
  extractNearTransactionHashes,
  normalizeFtBalanceYocto,
  socialToYocto,
  viewContractAt,
  yoctoToSocial,
} from '@/lib/near-rpc';
import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { SigningWallet } from '@/lib/portal-social-session';

const os = createPortalOnSocialClient();

export type PortalSocialSpendTransaction = ReturnType<
  typeof os.socialSpend.buildSpendTransaction
>;

export type PortalSocialSpendClaimTransaction = ReturnType<
  typeof os.socialSpend.buildClaimTargetBalanceTransaction
>;

/** Minimum `support_profile` spend (0.01 SOCIAL, 18 decimals). */
export const SUPPORT_PROFILE_MIN_YOCTO = 10_000_000_000_000_000n;

export const SUPPORT_PROFILE_MIN_SOCIAL_LABEL = '0.01';

export const SUPPORT_PROFILE_PRESET_SOCIAL = ['1', '5', '10'] as const;

export function socialSpendContractId(): string {
  return os.socialSpend.contractId;
}

export function parseSupportAmountYocto(input: string): bigint {
  const yocto = BigInt(socialToYocto(input.trim()));
  if (yocto < SUPPORT_PROFILE_MIN_YOCTO) {
    throw new Error(
      `Minimum support is ${SUPPORT_PROFILE_MIN_SOCIAL_LABEL} SOCIAL.`
    );
  }
  return yocto;
}

export async function fetchProfileSupportBalanceYocto(
  accountId: string
): Promise<bigint> {
  const raw = await viewContractAt<unknown>(
    socialSpendContractId(),
    'get_target_balance',
    { account_id: accountId }
  );
  return normalizeFtBalanceYocto(raw);
}

export function formatSupportBalanceLabel(yocto: bigint): string {
  if (yocto <= 0n) return '0';
  const social = yoctoToSocial(yocto.toString());
  const numeric = Number.parseFloat(social);
  if (!Number.isFinite(numeric)) return social;
  if (numeric >= 1000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(numeric);
  }
  if (numeric >= 1) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  return social;
}

export async function sendPortalWalletTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  payload: PortalSocialSpendTransaction | PortalSocialSpendClaimTransaction
): Promise<string[]> {
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: payload.receiverId,
    actions: payload.actions.map((action) => ({
      type: 'FunctionCall' as const,
      params: {
        methodName: action.methodName,
        args: action.args,
        gas: action.gas,
        deposit: action.deposit,
      },
    })),
  });
  return extractNearTransactionHashes(result);
}

export function buildSupportProfileTransaction(
  targetAccountId: string,
  amountYocto: string | bigint
): PortalSocialSpendTransaction {
  return os.socialSpend.buildSpendTransaction({
    amount:
      typeof amountYocto === 'bigint' ? amountYocto.toString() : amountYocto,
    appId: 'portal',
    action: 'support_profile',
    targetType: 'profile',
    targetId: targetAccountId,
  });
}

export function buildClaimSupportBalanceTransaction(): PortalSocialSpendClaimTransaction {
  return os.socialSpend.buildClaimTargetBalanceTransaction();
}
