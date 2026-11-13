## 1. best-in-class call

A boost should spend SOCIAL and not ask the person to hold NEAR for the fee. The relayer already sponsors NEP-366 delegate actions for `execute` on the product contracts. Extend that path so a single `ft_transfer_call` on the SOCIAL token can be sponsored, and only when the parsed `receiver_id` is the boost contract.

The core app session key cannot sign that call. It is a function-call key for `core.onsocial.*` method `execute`. A delegate’s inner receiver has to match the key. Reuse the existing session grant (`bootstrapSession` / `restoreSession`, the same shape as app access) with a second key whose receiver is the token and whose only method is `ft_transfer_call`. The first boost asks the wallet once to add that key. Later boosts are quiet. The welcome drip still funds an empty account before that one-time add, the same way session setup does.

Do not add a second toast, a second sheet, or a new button. Commit and Increase stay the buttons. Success stays `txToastSuccess.boostCommitted`. When the daily cap is used up, the same button falls through to the wallet the sheet already uses. If that also fails, the toast says “Today’s free boost is used up.” Collect, unlock, renew, and extend stay wallet calls. They are not token transfers.

Mainnet stays rewards-only on the relayer allow-list. `boost.onsocial.near` has no wasm (`Resources/mainnet-golive.md`). Sponsoring a transfer aimed at a missing account would burn relayer NEAR. Testnet is the product network, and `token.onsocial.testnet` plus `boost.onsocial.testnet` are the accounts in config.

There is no per-user gas quota store in the relayer or the gateway. Gateway `rate-limiter-flexible` counts HTTP requests, not sponsored gas. A new in-memory daily counter lives next to the delegate handler, with the cap and the gas price on relayer config. It is not shared across relayer replicas.

The 2026-11-12 audit is right that `RELAYER_API_KEY` fails open when the key is empty (`packages/onsocial-relayer/src/middleware.rs` returns the request when the env var is missing). This change does not touch that middleware. The empty-key dev mode stays as it is.

## 2. alignment map

Relayer allow-list and delegate checks: `packages/onsocial-relayer/src/config.rs`, `handlers.rs`, `state.rs`. New validation and the daily counter: `packages/onsocial-relayer/src/boost_sponsor.rs`.

Testnet allow-list strings that override the code default: `deployment/docker-compose.yml`, `deployment/.env.production.example`, `deployment/deploy-production.sh`, `scripts/generate-env.sh`, `scripts/sync-production-env.sh`, `packages/onsocial-relayer/README.md`, `packages/onsocial-relayer/relayer.toml`. Mainnet files stay `rewards.onsocial.near` only (`deployment/docker-compose.relayer.yml`, `deployment/.env.relayer.mainnet.example`, `deployment/deploy-relayer-host.sh`).

SDK write: `packages/onsocial-sdk/src/modules/boost.ts` `commitLock`, relay helper in `packages/onsocial-sdk/src/internal/session-bridge.ts`. Gateway already forwards `POST /relay/delegate` (`packages/onsocial-gateway/src/routes/relay.ts`). No new route. The browser proxy already allows that path.

App: `packages/onsocial-app/src/lib/boost-sponsor.ts` and the commit branch in `packages/onsocial-app/src/features/boost/portfolio-boost-sheet.tsx`. Toast copy: `packages/onsocial-app/src/lib/transaction-toast-copy.ts`. Words: `docs/glossary.md`.

Account ids: `packages/onsocial-sdk/src/internal/contracts.ts` and `packages/onsocial-app/src/lib/app-config.ts` (`token.onsocial.testnet`, `boost.onsocial.testnet`, and the `.near` pair).

## 3. near idioms

The outer transaction is still one `Action::Delegate` paid by the relayer. The inner receipt’s predecessor is the user, which is what `ft_transfer_call` requires so the tokens leave their balance.

Sponsored shape, all of it or nothing:

- Inner receiver is the SOCIAL token for that network.
- Exactly one inner action.
- Method is `ft_transfer_call`. `ft_transfer` and every other method are rejected.
- Attached deposit is exactly 1 yoctoNEAR. Zero and anything above 1 are rejected. Existing `execute` calls still allow 0 or 1.
- Args are parsed as a JSON object. `receiver_id` must be an account id equal to the boost contract. A memo that merely contains that string does not pass.

The daily cap charges prepaid gas times `RELAYER_BOOST_SPONSOR_GAS_PRICE_YOCTO` (default `100000000`, the common minimum gas price). The default cap is `10000000000000000000000` yoctoNEAR (0.01 NEAR). The commit uses 80 TGas, which prices to 0.008 NEAR, so one sponsored boost fits in a UTC day and the next one is refused until the day rolls. The counter key is the delegate sender, not a client-supplied account. A failed submit releases the charge. A broadcast that later reverts does not, because the relayer already paid.

The 1 yocto confirmation is still the user’s, not the relayer’s. That is the NEP-141 rule. The relayer pays the fee. Copy never calls that fee gas.

## 4. side effects

`ft_transfer_call` is not added to the global method list. A delegate aimed at core, scarces, or rewards still cannot call it, even if an operator appends the name to `RELAYER_ALLOWED_METHODS`. The token contract accepts that one method and nothing else, including `execute`.

Mainnet default allow-list is unchanged. Turning the token on there is an env change after `boost.onsocial.near` has wasm, plus an update to `Resources/mainnet-golive.md` and `scripts/check-mainnet-contracts.mjs`. This change does not do that.

The cap is process-local. Two relayer replicas can each sponsor 0.01 NEAR for the same account on the same day. There is no Redis client in the relayer crate, and the gateway request limiter is the wrong store.

`RELAYER_API_KEY` still fails open when unset. `/execute_delegate` stays unprotected in that dev mode. This patch does not widen or close that.

Collect, unlock, renew, and extend are unchanged. A sponsored boost that the chain reverts is not sent a second time from the wallet. A cap refusal, a relayer outage, or no token key falls through to the existing wallet transaction. Cancelling the one-time key prompt stops the tap. The mock signer used in Playwright skips the key prompt and records the wallet `ft_transfer_call`, which is the fallback.

No sheet layout, type, or color change. Width, height, and control positions stay the ones already shipped. No before/after geometry shots, because there is no layout diff to measure. The UX check is the copy and the fallback, on the existing boost sheet. Phone targets in the brief are iPhone, Samsung, and Pixel, across Chrome, Safari, and Brave. Those are the same sheet. Playwright covers the commit on a 390×844 phone (iPhone-class). Samsung and Pixel widths, and Safari and Brave, are the same DOM. They were not given a separate browser farm here.

## 5. shipped

Commit and Increase still use the existing boost sheet. When a token session key is on the account, the lock is a single sponsored `ft_transfer_call` through `os.boost.commitLock` → `POST /relay/delegate` → `/execute_delegate`. The first boost adds that key with the same session grant the app already uses, after the welcome drip when the account is empty. Collect, unlock, renew, and extend stay wallet calls.

The relayer accepts that call only for `token.onsocial.testnet` (or `token.onsocial.near` when an operator allow-lists it) when the parsed `receiver_id` is the boost account, the deposit is exactly 1 yoctoNEAR, and there is one action. `ft_transfer`, a different receiver, a wrong deposit, and a second action are refused. The daily budget is 0.01 NEAR of prepaid gas per account per UTC day (`RELAYER_BOOST_SPONSOR_DAILY_CAP_YOCTO`, `RELAYER_BOOST_SPONSOR_GAS_PRICE_YOCTO`). At 80 TGas that is one sponsored boost. The next one returns `BOOST_SPONSOR_DAILY_CAP` and the sheet falls through to the wallet. If that confirm fails, the toast is “Today’s free boost is used up.”

Mainnet’s default allow-list is still `rewards.onsocial.near`. `RELAYER_API_KEY` still fails open when empty. That middleware was not changed.

No sheet layout change, so there is no before/after geometry set. The commit fallback is covered on a 390×844 phone viewport in Playwright (iPhone-class). Samsung, Pixel, Safari, and Brave share that DOM. They were not run as separate browser binaries.

`cargo test -p onsocial-relayer --lib` 52 passed. `cargo clippy -p onsocial-relayer --all-targets -- -D warnings` clean. SDK boost and session-bridge tests 34 passed. Gateway relay tests 10 passed. App `boost-sponsor` tests 5 passed. App `tsc --noEmit` clean.

The push ran `pnpm check:push` through the git hook (no `--no-verify`). SDK 1468 tests, gateway 814 tests, and app 3531 tests passed. Playwright on that hook was 379 passed, 9 flaky (retries passed), 2 skipped. The flaky cases are existing portfolio and gate specs, not the boost commit.
