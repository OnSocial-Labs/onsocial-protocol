import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

/**
 * Creator FT template — deploy via UseGlobalContract (not inline WASM).
 *
 * Env overrides (any network):
 * - NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH (preferred — immutable CodeHash mode)
 * - NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT (AccountId mode, staging)
 *
 * Testnet default is the hash-mode publish from `onsocial.testnet`
 * (tx B4Zs9VjibFvfJcjaAqwwt6yRoEWqkcKMTBJyDHuLFoxq). That account is the
 * payer, not an AccountId-mode identifier — do not look it up with
 * view_global_contract_code_by_account_id.
 *
 * No silent fallback to `token.onsocial.*` — that is SOCIAL, a normal deploy.
 */

export const FT_TEMPLATE_CODE_HASH = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH ?? ''
).trim();

export const FT_TEMPLATE_GLOBAL_ACCOUNT = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT ?? ''
).trim();

/** Hash-mode global publish paid by `onsocial.testnet`. */
export const TESTNET_FT_TEMPLATE_CODE_HASH =
  'F5pLh9QT1JJH2uMAatMyEAsRGKdJUPh54j9EMopUwZEA';

/** Default funding for subaccount + FT state (human NEAR). */
export const FT_CREATE_FUND_NEAR = '0.5';

export const FT_TOKEN_DECIMALS = 18;

export type FtTemplateIdentifier =
  | { kind: 'codeHash'; codeHash: string }
  | { kind: 'accountId'; accountId: string };

/** Resolved template reference for UseGlobalContract — null until configured. */
export function resolveFtTemplateIdentifier(): FtTemplateIdentifier | null {
  if (FT_TEMPLATE_CODE_HASH) {
    return { kind: 'codeHash', codeHash: FT_TEMPLATE_CODE_HASH };
  }
  if (FT_TEMPLATE_GLOBAL_ACCOUNT) {
    return { kind: 'accountId', accountId: FT_TEMPLATE_GLOBAL_ACCOUNT };
  }
  if (ACTIVE_NEAR_NETWORK === 'testnet') {
    return { kind: 'codeHash', codeHash: TESTNET_FT_TEMPLATE_CODE_HASH };
  }
  return null;
}
