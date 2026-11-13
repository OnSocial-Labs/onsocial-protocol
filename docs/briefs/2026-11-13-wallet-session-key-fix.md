## 1. best-in-class call

Settings Allow and Renew should add the same kind of key onboarding already adds. The account is the predecessor on `execute`, and the contract treats that account as allowed on its own tree. A second `execute_admin` `set_key_permission` does not grant the owner anything the key does not already have. It does attach 100 TGas. At the minimum gas price that is 0.01 NEAR, which does not fit in the welcome top-up once the sponsored allowance (0.008 NEAR) and the AddKey fee headroom (0.002 NEAR) are counted against the 0.013 NEAR threshold.

The call is one AddKey for an owner app session, then the same persist onboarding uses. Delegated and cross-account grants still write `set_key_permission`. That API stays. The wallet settings banner is not in this change. It waits on an approved design.

## 2. alignment map

Owner vs delegated plan: `packages/onsocial-sdk/src/advanced/session.ts` (`isOwnerAccountScope`, `buildSessionGrant`, `buildSessionRevoke`). An owner path is the signer account or a path under it (`alice.near/`, `alice.near/profile`). `apps/myapp/` and `bob.near/` stay delegated. A storage deposit on an owner path is still included. Only the permission action is dropped. `packages/onsocial-sdk/src/advanced/bootstrap.ts` skips the wallet call when that plan has no actions (owner key already on the account, AddKey omitted). `revokeSession` passes the signer account, so an owner remove is DeleteKey only.

Settings and onboarding: `packages/onsocial-app/src/lib/app-social-session.ts`. `appSessionKeySpec` is the one description of the owner key (core `execute`, allowance from the sponsor helper). Onboarding still sends it through `connect({ addFunctionCallKey })`. Settings Allow and Renew send the same spec as one AddKey via the connected wallet, then `commitOwnerAppAccess` → `persistSessionFromKey`. Renew reuses the stored key. If that key is still on the account, commit only refreshes the local 90-day expiry.

Sponsor: `packages/onsocial-app/src/lib/app-session-sponsor.ts` (`ADD_KEY_FEE_HEADROOM_YOCTO`, `PERMISSION_WRITE_GAS_YOCTO`). `packages/onsocial-app/src/lib/welcome-near.ts` `fundAppSessionIfNeeded` re-reads the balance when the sponsor does not drip, and throws if the account is still under the threshold. The relayer and `packages/onsocial-backend/src/routes/welcome-near.ts` are unchanged.

Copy: `packages/onsocial-app/src/lib/wallet-errors.ts` `mapAppAccessError`, `txToastError.allowAppAccessFailed` in `transaction-toast-copy.ts`, used by `app-access-sheet.tsx`. `docs/glossary.md` records App access and the failure line.

Re-scan after the edits: community handoff still calls `grantCommunityAppSession` → `buildSessionGrant` with `apps/<id>/`, so that grant still emits AddKey and `set_key_permission`. Portal welcome-near is a separate helper and was not retargeted. No banner component was added.

## 3. near idioms

AddKey installs a function-call access key on the signer, receiver `core`, method `execute`, allowance chosen by `chooseSessionKeyAllowanceYocto`. That is the native scope. The contract’s execute context is the predecessor (`contracts/core-onsocial/src/state/execute/auth.rs`). `has_account_permissions` returns immediately when the grantee is the account (`domain/groups/permissions/kv/eval.rs`). `set_key_permission` remains the way to authorize a key on a path that account does not own. Sandbox coverage of an owner function-call key writing with no permission row is `tests/src/key_permissions_tests.rs` (`test_session_key_access_key_can_call_set_without_wallet`).

The 90-day expiry for an owner app key is local session metadata. It is not a chain permission TTL. Renew of a key that is still on the account does not submit a transaction. User cancel stays quiet (`isWalletUserCancellation`). The toast does not say gas, on-chain, contract, or transaction hash.

## 4. side effects

Allow on a missing key is one wallet confirmation. The action list is a single AddKey. Renew of a key that is still on the account shows success and does not open the wallet. Renew of a key that is gone sends AddKey for that same key, not a second key. If AddKey is submitted but the key is not visible yet, the pending secret is kept so the next Allow retries the same key.

Remove of an owner app key is DeleteKey only. A permission row written by an older Allow is not cleared. Level 0 revoke of a missing row is a no-op on the contract, and a deleted key cannot sign, so the leftover row does not authorize anything. It expires with the timestamp that was stored, or it sits unused. Delegated revoke still clears the row.

`fundAppSessionIfNeeded` no longer returns when the sponsor is off, reports a sufficient balance, or declines to drip, if a fresh read is still under 0.013 NEAR. A real drip still waits for that balance and throws if it never arrives. An account that is already over the threshold does not call the sponsor. The welcome route and the relayer are untouched.

Onboarding’s connect options are built from the same key spec. A connected empty account still gets the setup toast, then AddKey. The failure toast for Allow, Renew, and Remove is the glossary line, including when the wallet error mentions gas or the chain. A submitted transaction that later fails confirmation still goes through the shared confirmation hook, which can surface the receipt text.

There is no layout change. The wallet settings banner is held for design approval and is not in this branch. No before/after measurements.

## 5. shipped

SDK: owner path `alice.near/` plans no `set_key_permission`; cross-account `bob.near/` and `apps/myapp/` still do; owner revoke is DeleteKey only; delegated revoke still clears the row. `bootstrapSession` for an owner path sends one AddKey, and sends nothing when AddKey is skipped.

App: `grantAppSocialSession` for `alice.testnet` signs one transaction whose only action is AddKey. The payload has no `execute_admin` and no `set_key_permission`. Renew of an on-account key does not call the wallet and moves `expiresAtMs` into the future. `grantCommunityAppSession` still signs AddKey plus `execute_admin` `set_key_permission`.

`mapAppAccessError` returns null for a user cancel. Gas, on-chain, contract, yocto, and `execute_admin` errors map to `Couldn't add app access. Try again in a moment.` or `Could not remove app access.` The sponsor tests throw when a non-drip response leaves the account under the threshold, return when a later read is funded, and wait out a real drip.

Those unit tests passed in this workspace (SDK session and bootstrap, 44 tests; app grant, community grant, error mapping, sponsor, and welcome top-up). The full `pnpm check:push` result is filled in after the pre-push hook.
