## 1. best-in-class call

Settings Allow and Renew should add the same kind of key onboarding already adds. The account is the predecessor on `execute`, and the contract treats that account as allowed on its own tree. A second `execute_admin` `set_key_permission` does not grant the owner anything the key does not already have. It does attach 100 TGas. At the minimum gas price that is 0.01 NEAR, which does not fit in the welcome top-up once the sponsored allowance (0.008 NEAR) and the AddKey fee headroom (0.002 NEAR) are counted against the 0.013 NEAR threshold.

The call is one AddKey for an owner app session, then the same persist onboarding uses. Delegated and cross-account grants still write `set_key_permission`. That API stays. The wallet settings banner is not in this change. It waits on an approved design.

A funded first visit should approve the key inside the same sign-in. The welcome drip and AddKey are different signers, so an unfunded first visit still signs in first. The account id is not in local storage on a first visit. It is knowable only when the chosen wallet will name it after the picker and before sign-in (`getAccounts`). When the wallet will not name it, sign-in stays without the key so an empty account can still connect. That case is two approvals even when the balance turns out to be enough. near-connect already filters the wallet list with `signInWithFunctionCallKey` when the key is bundled. A first visit has already picked a wallet, so that wallet has to advertise the feature or the key stays off the first sign-in.

## 2. alignment map

Owner vs delegated plan: `packages/onsocial-sdk/src/advanced/session.ts` (`isOwnerAccountScope`, `buildSessionGrant`, `buildSessionRevoke`). An owner path is the signer account or a path under it (`alice.near/`, `alice.near/profile`). `apps/myapp/` and `bob.near/` stay delegated. A storage deposit on an owner path is still included. Only the permission action is dropped. `packages/onsocial-sdk/src/advanced/bootstrap.ts` skips the wallet call when that plan has no actions (owner key already on the account, AddKey omitted). `revokeSession` passes the signer account, so an owner remove is DeleteKey only.

Settings and onboarding: `packages/onsocial-app/src/lib/app-social-session.ts`. `appSessionKeySpec` is the one description of the owner key (core `execute`, allowance from the sponsor helper). Onboarding still sends it through `connect({ addFunctionCallKey })`. Settings Allow and Renew send the same spec as one AddKey via the connected wallet, then `commitOwnerAppAccess` → `persistSessionFromKey`. Renew reuses the stored key. If that key is still on the account, commit only refreshes the local 90-day expiry.

Sponsor: `packages/onsocial-app/src/lib/app-session-sponsor.ts` (`ADD_KEY_FEE_HEADROOM_YOCTO`, `PERMISSION_WRITE_GAS_YOCTO`). `packages/onsocial-app/src/lib/welcome-near.ts` `fundAppSessionIfNeeded` re-reads the balance when the sponsor does not drip, and throws if the account is still under the threshold. The relayer and `packages/onsocial-backend/src/routes/welcome-near.ts` are unchanged.

Copy: `packages/onsocial-app/src/lib/wallet-errors.ts` `mapAppAccessError`, `txToastError.allowAppAccessFailed` in `transaction-toast-copy.ts`, used by `app-access-sheet.tsx`. `docs/glossary.md` records App access and the failure line.

First connect: `resolveAppConnectRoute` in `packages/onsocial-app/src/lib/app-session-sponsor.ts` bundles whenever the account does not need the drip and this is not the switch-wallet picker. `hasStoredHint` no longer blocks a funded first visit. `walletMayBundleSessionKey` keeps the returning path on the wallet-list filter, and requires `signInWithFunctionCallKey` on the already chosen wallet for a first visit. `resolveBundledAppConnect` in `app-wallet-context.tsx` takes that account id, stored or previewed. A first visit calls `selectWallet`, peeks `getAccounts`, then `connect({ walletId, addFunctionCallKey })` only when the peek is funded and the wallet can add the key. The same pending key and `completeAppSessionAfterConnect` path finish it. The e2e stand-in is `createE2eFirstConnectConnector` in `e2e-mock-signer.ts`.

Re-scan after the edits: community handoff still calls `grantCommunityAppSession` → `buildSessionGrant` with `apps/<id>/`, so that grant still emits AddKey and `set_key_permission`. Portal welcome-near is a separate helper and was not retargeted. No banner component was added. Switch wallet still calls `connect({})` with no key. An already connected `connect()` still resumes through `ensureSocialSession` and does not bundle into that resume.

## 3. near idioms

AddKey installs a function-call access key on the signer, receiver `core`, method `execute`, allowance chosen by `chooseSessionKeyAllowanceYocto`. That is the native scope. The contract’s execute context is the predecessor (`contracts/core-onsocial/src/state/execute/auth.rs`). `has_account_permissions` returns immediately when the grantee is the account (`domain/groups/permissions/kv/eval.rs`). `set_key_permission` remains the way to authorize a key on a path that account does not own. Sandbox coverage of an owner function-call key writing with no permission row is `tests/src/key_permissions_tests.rs` (`test_session_key_access_key_can_call_set_without_wallet`).

The 90-day expiry for an owner app key is local session metadata. It is not a chain permission TTL. Renew of a key that is still on the account does not submit a transaction. User cancel stays quiet (`isWalletUserCancellation`), including a rejected wallet list. The toast does not say gas, on-chain, contract, or transaction hash.

`signInWithFunctionCallKey` is the wallet feature that adds the function-call key during sign-in. The balance check uses `accountNeedsAppSessionSponsor` and `WELCOME_NEAR_THRESHOLD_YOCTO` (0.013 NEAR). That is the existing “enough to skip the drip” line. It is above key storage (~0.00139 NEAR) plus the AddKey fee, so no new threshold was added. A balance that is unknown (`getAccounts` empty or thrown) is treated as “do not bundle.”

## 4. side effects

Allow on a missing key is one wallet confirmation. The action list is a single AddKey. Renew of a key that is still on the account shows success and does not open the wallet. Renew of a key that is gone sends AddKey for that same key, not a second key. If AddKey is submitted but the key is not visible yet, the pending secret is kept so the next Allow retries the same key.

Remove of an owner app key is DeleteKey only. A permission row written by an older Allow is not cleared. Level 0 revoke of a missing row is a no-op on the contract, and a deleted key cannot sign, so the leftover row does not authorize anything. It expires with the timestamp that was stored, or it sits unused. Delegated revoke still clears the row.

`fundAppSessionIfNeeded` no longer returns when the sponsor is off, reports a sufficient balance, or declines to drip, if a fresh read is still under 0.013 NEAR. A real drip still waits for that balance and throws if it never arrives. An account that is already over the threshold does not call the sponsor. The welcome route and the relayer are untouched.

Onboarding’s connect options are built from the same key spec. A connected empty account still gets the setup toast, then AddKey. The failure toast for Allow, Renew, and Remove is the glossary line, including when the wallet error mentions gas or the chain. A submitted transaction that later fails confirmation still goes through the shared confirmation hook, which can surface the receipt text.

A funded first visit whose wallet names the account sees one sign-in, and that sign-in includes the key. An unfunded first visit sees a sign-in without the key, then the drip, then a second sign-in for the key. A first visit whose wallet will not name the account also signs in without the key. If that account is funded, the follow-up AddKey is a second approval. Returning funded connects are unchanged: the key is still inside the first `connect`, and the wallet list is filtered to wallets that support the feature. The switch-wallet picker still does not bundle.

There is no layout change. The wallet settings banner is held for design approval and is not in this branch. No before/after measurements.

## 5. shipped

SDK: owner path `alice.near/` plans no `set_key_permission`; cross-account `bob.near/` and `apps/myapp/` still do; owner revoke is DeleteKey only; delegated revoke still clears the row. `bootstrapSession` for an owner path sends one AddKey, and sends nothing when AddKey is skipped.

App: `grantAppSocialSession` for `alice.testnet` signs one transaction whose only action is AddKey. The payload has no `execute_admin` and no `set_key_permission`. Renew of an on-account key does not call the wallet and moves `expiresAtMs` into the future. `grantCommunityAppSession` still signs AddKey plus `execute_admin` `set_key_permission`.

`mapAppAccessError` returns null for a user cancel. Gas, on-chain, contract, yocto, and `execute_admin` errors map to `Couldn't add app access. Try again in a moment.` or `Could not remove app access.` The sponsor tests throw when a non-drip response leaves the account under the threshold, return when a later read is funded, and wait out a real drip.

Route tests: a funded first visit with no stored hint bundles; an unfunded first visit does not; a known funded account still bundles; an empty known account still does not; the switch-wallet picker still does not. `walletMayBundleSessionKey` is true for a returning connect even when the flag is false, and true for a first visit only when the chosen wallet supports `signInWithFunctionCallKey`.

The Job 2 hook run (head `44001a85`, before this first-connect commit) passed: SDK and app unit tests, app production build, Playwright 383 passed, 5 flaky, 1 skipped. The flakes were collection supply, dm compose voice, drawer chevron, endorse supporters, and the gate focus check. This commit’s `pnpm check:push` result is filled in after the next hook.
