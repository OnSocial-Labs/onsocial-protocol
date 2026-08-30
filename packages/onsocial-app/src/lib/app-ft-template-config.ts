/**
 * Creator FT template — deploy via UseGlobalContract (not inline WASM).
 *
 * Ops must publish `token-onsocial` as a global contract once, then set ONE of:
 * - NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH (preferred — immutable CodeHash mode)
 * - NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT (AccountId mode)
 *
 * No silent fallback to `token.onsocial.*` — that account is a normal deploy
 * until explicitly published as a global contract.
 */
export const FT_TEMPLATE_CODE_HASH = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH ?? ''
).trim();

export const FT_TEMPLATE_GLOBAL_ACCOUNT = (
  process.env.NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT ?? ''
).trim();

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
  return null;
}
