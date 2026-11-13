## 1. best-in-class call

The second AddKey is inherent to the 749 design, and that design cannot succeed on chain.

A NEAR function-call key has one receiver. App access is a key for `core.onsocial.testnet` and `execute`. A sponsored boost signed a delegate whose inner receiver is `token.onsocial.testnet` and whose method is `ft_transfer_call`, with a deposit of 1 yocto. `greenghost.onsocial.testnet` added that token key in `7ZvhgZWg9nDo6Ni7GvReeYWaA9ZRNAhNgocTBP7XxucB` at 20:33:19 UTC, then the relayer submitted four delegates (`7jTpSajp…`, `DiFfQfhG…`, `9LVr4343…`, `eKnR9uQ3Gy8bS3B1pCTY8q2GeVnSSpnF8tPsFFtmt3G`). Each `EXPERIMENTAL_tx_status` is `Failure` / `ActionError` / `DelegateActionAccessKeyError::DepositWithFunctionCall`. The protocol rejects any action with a deposit signed by a function-call key. `ft_transfer_call` requires 1 yocto. An FC key on the token cannot sign it. The 749 tests signed the delegate in process and never applied that chain rule.

After a `reverted` attempt the sheet set “Could not commit SOCIAL.” and returned. It did not fall through to the wallet transfer. Commit was broken for everyone on testnet: AddKey, then that toast.

This hotfix deletes that path. Commit and Increase send the same wallet `ft_transfer_call` they sent before 749. No token session key is created.

### Feasibility proof (not built)

Verdict: a full-access signature is accepted by the deployed relayer and by the protocol. The SOCIAL lock did not land. One wallet prompt exists only on wallets whose manifest sets `signDelegateActions`.

1. `@hot-labs/near-connect` 0.11.4 (`package.json` `version`) exposes `signDelegateActions` on `NearWalletBase` (`build/types/index.d.ts` lines 104–114 and 183). `WalletFeatures.signDelegateActions` is a boolean on the manifest (`build/types/index.d.ts` line 137). The three adapters forward it: `InjectedWallet.js` lines 62–70, `ParentFrameWallet.js` lines 73–82 (`near:signDelegateActions`), `SandboxedWallet/index.js` lines 57–66 (`wallet:signDelegateActions`). There is no second method name. Manifests load from `NearConnector.js` lines 14–17, including `https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json` (fetched 2026-11-13, 14 wallets). `signDelegateActions: true`: HOT Wallet (Android, iOS, Chrome, Firefox, Telegram), Meteor (web, Chrome, Android, iOS), Intear, Ledger, NEAR Mobile (Android, iOS), near-cli. Absent or false: MyNearWallet, OKX, Nightly, Hana, Unity, WalletConnect, Trezu, ethereum-wallets. `NearWalletsPopup.js` lines 17–24 set the flag on a debug “Custom Wallet” manifest. That is not a production wallet. The sheet still calls only `signAndSendTransaction`. This proof does not add a prompt.

2. `validate_token_boost_transfer` in `packages/onsocial-relayer/src/boost_sponsor.rs` (lines 68–102) checks one `ft_transfer_call`, deposit exactly 1 yocto, positive gas, and a parsed `receiver_id` of the boost contract. It does not read the signer’s key class. A full-access signature of that shape passes the same check as any other valid signature.

3. Real testnet transaction, signed with `near-api-js` 7.1.0 `Account.createSignedMetaTransaction` (`lib/accounts/account.d.ts` line 173) and `encodeSignedDelegate` (`lib/transactions/schema.d.ts` line 17). Throwaway `osboostfeas1794602665.testnet`, key `ed25519:3dCh2dqx14KqfPAV9QLyKRpJdnNztx8mf4JUmhdF7M9F`, permission `FullAccess` (created by the testnet helper faucet). Inner action: `ft_transfer_call` on `token.onsocial.testnet`, deposit `1`, amount `1`, msg `{"action":"lock","months":1}`, receiver `boost.onsocial.testnet`, gas 80 TGas. Posted to the live app proxy `https://testnet.app.onsocial.id/api/onapi/relay/delegate?wait=true`, which forwards to the relayer. Response `200` `{"success":true,"tx_hash":"Hm3SHqvmN41vUz5kvYxU95N6SLQgV2xwrN7ygbc43BtU"}`. `EXPERIMENTAL_tx_status`: outer signer `relayer.onsocial.testnet`, receiver the throwaway, one `Delegate`, top-level status `SuccessValue`. The token receipt is `Failure` / `FunctionCallError` / `ExecutionError`: `Smart contract panicked: The account doesn't have enough balance`. It is not `DepositWithFunctionCall`. `boost.onsocial.testnet` `get_account` for the throwaway is `locked_amount` `0`. The token owner is `onsocial.testnet`, the supply was minted once, and there is no public mint. A new faucet account has NEAR and zero SOCIAL, so the lock cannot land until that account holds SOCIAL.

The other option, a contract method that locks without a 1 yocto deposit, is still not built. Boost lock today is only `ft_on_transfer` after `ft_transfer_call`. A function-call key with several method names still has one receiver. It cannot replace the full-access signature.

## 2. alignment map

Removed from the client:

- `packages/onsocial-app/src/lib/boost-sponsor.ts` and its test. That was the token `AddKey`.
- `os.boost.commitLock`, `relaySignedFunctionCall`, and `BoostSponsorLimitError`.
- The `sponsor` branch in `portfolio-boost-sheet.tsx` `runBoostTransaction`, including the `reverted` return that skipped the wallet.

Commit again matches Collect, Renew, Extend, and Unlock: `wallet.signAndSendTransaction`, then `trackTransaction` with `txToastSuccess.boostCommitted` and `txToastError.commitBoostFailed`.

Kept:

- Relayer allow-list and `validate_delegate_actions` in `packages/onsocial-relayer/src/boost_sponsor.rs`. Nothing in the app posts that delegate now.
- The guard on `Session.signDelegate`: a session without `canAttachDeposit` cannot sign a deposit. The new test is `rejects an ft_transfer_call delegate signed by a function-call key` in `session.test.ts`.

## 3. near idioms

`DelegateActionAccessKeyError::DepositWithFunctionCall` is the runtime rule. A function-call key may sign a 0-deposit call. It may not sign `ft_transfer_call`, because NEP-141 requires 1 yocto. The relayer paying the fee does not change the signer’s key class. A full-access key may sign the deposit. The relayer can still pay the outer transaction if that signature is a delegate and not a broadcast.

## 4. side effects

The relayer validator stays. The app does not call it. A one-off proof did: the deployed relayer accepted `Hm3SHqvmN41vUz5kvYxU95N6SLQgV2xwrN7ygbc43BtU` and the token then rejected a zero SOCIAL balance. Keep the validator until a full-access delegate is a product path. It is the check that the transfer is one `ft_transfer_call` to the boost contract. Removing it does not fix commit. Do not treat the proof transaction as product behavior.

`token.onsocial.testnet` remains on the deployed testnet allow-list. That was not the failure.

People who already approved the token `AddKey` still have that key on the account. This change does not delete it.

`RELAYER_API_KEY` still fails open when empty. This note does not change that.

No layout change.

## 5. shipped

Commit and Increase are wallet transactions again. The app does not create a token session key. A function-call session that tries to sign `ft_transfer_call` with a deposit is rejected in `Session.signDelegate` before a nonce is spent.

`Session.signDelegate` rejects the 1 yocto `ft_transfer_call` and leaves the nonce at 1. SDK session, boost, and session-bridge tests: 51 passed.
