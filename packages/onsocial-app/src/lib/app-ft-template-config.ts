import { SOCIAL_TOKEN_CONTRACT } from '@/lib/app-config';

/**
 * Creator FT template — deploy via UseGlobalContract (not inline WASM).
 *
 * Ops must publish `token-onsocial` as a global contract once:
 * - CodeHash mode → set NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH
 * - AccountId mode → set NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT
 *
 * If unset, we try the protocol SOCIAL account id (only works after that
 * account has DeployGlobalContract with AccountId mode).
 */
export const FT_TEMPLATE_CODE_HASH = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH ?? ''
).trim();

export const FT_TEMPLATE_GLOBAL_ACCOUNT = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT ?? ''
).trim();

/** Default funding for subaccount + FT state (yocto). */
export const FT_CREATE_FUND_NEAR = '0.5';

export const FT_TOKEN_DECIMALS = 18;

export type FtTemplateIdentifier =
  | { kind: 'codeHash'; codeHash: string }
  | { kind: 'accountId'; accountId: string };

/** Resolved template reference for UseGlobalContract. */
export function resolveFtTemplateIdentifier(): FtTemplateIdentifier | null {
  if (FT_TEMPLATE_CODE_HASH) {
    return { kind: 'codeHash', codeHash: FT_TEMPLATE_CODE_HASH };
  }
  const accountId = FT_TEMPLATE_GLOBAL_ACCOUNT || SOCIAL_TOKEN_CONTRACT;
  if (accountId) {
    return { kind: 'accountId', accountId };
  }
  return null;
}
