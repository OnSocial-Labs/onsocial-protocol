## 1. best-in-class call

The logged-out gate should be the final frame on the first paint. A returning person should land on their page, and the browser bar should match the theme they already chose.

The mark fades in from `opacity: 0` over `--os-motion-overlay` (320ms). That is the empty card. Drop that fade. Keep the slow `breathe` on the mark. A view transition would still open on an empty frame, so it does not help.

The white behind the card is `html` / `body` with `--bg: #ffffff` while the column is the same white, and the canvas is white until the theme script runs. Paint the theme canvas in the existing blocking theme script (`color-scheme` plus a `background-color` on `html, body`). On desktop light, paint the gutters with `hsl(var(--border))` so the 36rem column reads as a card. The hairline already on `.app-surface` stays. A second theme store, or a cookie the server reads, would drift from `onsocial.theme`. The script is the store the toggle already writes.

Returning people already have `localStorage['onsocial.app.wallet.accountId']`. A blocking script on `/` calls `location.replace` to the same path `gateContinuePath` builds (`/@id`, and `?sheet=boost` or `?sheet=rally`). That runs before the gate paints, so “Opening your page…” never shows. An HTTP 302 would need a cookie copied from that key. The cookie can drift, and the server still cannot see `localStorage`. The script uses the key the wallet already writes. Session restore stays on `restoreAppSocialSession` and no longer blocks `isLoading`. The first client render seeds the account id from that key. The account route shows a skeleton inside `PortfolioShell` instead of an empty white document.

Install-line shift is already 0 after the gate-button change. Do not touch that slot.

`theme-color` is one dark value, so a light theme keeps a dark browser bar. Export both media variants from the viewport, and let the theme script set the bar to the active theme. A stored choice locks the bar. With no stored choice, the media variants follow the system, and a system change updates `data-theme`. The toggle writes the same key and attribute. Meta colors cannot read CSS variables. Light is `#ffffff` (`--bg`). Dark stays `#0c0d10`.

The gate’s top pad is a fixed `--os-gutter` (12px). Use `max(var(--os-gutter), env(safe-area-inset-top, 0px))`, the same pattern as the side insets.

## 2. alignment map

Logged-out gate: `packages/onsocial-app/src/app/page.tsx` (`.gate.app-surface`), `gate-connect.tsx`, `gate-pwa-install.tsx`, `gate-dapp-rail.tsx`, `globals.css`.

Theme: `theme-init.ts`, `theme-init-script.tsx`, `theme-toggle.tsx`, `layout.tsx` viewport.

Return path: new `gate-return.ts` next to `gate-viewport.ts`, mounted from the root layout the same way as `ThemeInitScript`. The href matches `gateContinuePath` in `overlay-routes.ts`. The storage key matches `app-wallet-context.tsx`.

Account first paint: the face page suspends into `PortfolioShell` (`portfolio-shell.tsx`) with the existing shimmer classes (`portfolio-avatar`, `standing-row-shimmer`). A segment `loading.tsx` is not used, because that boundary unmounts an open reader and standing sheet on the way to another account route.

Wallet: `app-wallet-context.tsx` seeds the stored id and does not wait on `restoreSocialSessionQuietly` before `setIsLoading(false)`. Restore still calls `restoreAppSocialSession`.

Re-scan after the edits: the install slot rules stay. Portfolio rails still use `.gate-dapp-rail`. Only the gate fade, the gate top pad, the light desktop gutter, the theme bar, and the return script change.

## 3. near idioms

No contract, gas, or storage-deposit change. Session restore stays the app session helper, which uses the SDK. The words on the gate stay Let’s connect, Install app, and Share → Add to Home Screen. The skeleton uses the existing phrase Loading face. No chain wording is added. `docs/glossary.md` is not in the tree. No new term.

## 4. side effects

Every document runs the theme script. It sets `data-theme`, `color-scheme`, and a canvas background before paint. A stored theme also sets `theme-color`. Desktop light gutters use `hsl(var(--border))`. The column keeps its own fill (gate `--bg`, portfolio mood, OS screen). Phone stays full-bleed because the column covers the canvas.

A full load of `/` with a stored account id navigates to `/@id` before the gate paints. A client navigation to `/` still uses the gate’s redirect. `isLoading` ends when the wallet connector returns, and the session restore continues in the background. The account route can paint the shell before page data arrives.

The install slot, the wheel, and Let’s connect are unchanged.

## 5. shipped

The mark’s first measured opacity is 1. Its only animation is `breathe`. Before the change, `gate-fade` was still running at 233ms and the opacity was 0.99.

Desktop light gutters compute to `rgb(226, 228, 233)`, which is `hsl(var(--border))`. The column stays `rgb(255, 255, 255)`. The dark canvas stays `rgb(0, 0, 0)`. A stored light theme sets every `theme-color` meta to `#ffffff`. Dark keeps `#0c0d10`.

A full load of `/` with `onsocial.app.wallet.accountId` set to `alice.testnet` replaces to `/@alice.testnet`. The gate text “Opening your page…” does not appear. The account shell is on screen. On that phone load the body background is `rgb(0, 0, 0)`.

Install-slot CLS, three runs each after the install prompt, is 0, 0, 0 on desktop, iPhone 13, and Pixel 7. The same measurement before this change was also 0. The install slot was not edited.

Theme script, return script, and gate CSS unit tests passed. `pnpm check:push` exited 0. App lint and typecheck passed. Unit tests were 503 files and 3511 tests. The production build compiled. Playwright was 362 passed, 5 flaky, 3 skipped. The flaky cases see the face skeleton and the resolved face at the same moment. The retry passes. Screenshots are in `/opt/cursor/artifacts/landing-before` and `/opt/cursor/artifacts/landing-after`.
