## 1. best-in-class call

Architectural change, first: the gate is pinned to the visual viewport (`visualViewport` height and offset, `100dvh` until that script runs), and the Let’s connect pill no longer paints through a backdrop layer. A backdrop snapshot was taken against the first viewport. Rotating the phone rebuilt the layout and left that frost on the pill as a split fill with a lip that read as a border. The install control had the same disease on first paint: a translucent fill, a blur, 72% opacity, and its own border.

Best-in-class for this screen is one filled action. Let’s connect stays the dock pill. Install app is the kit’s text button (`os-commit-cancel`): no fill, no border, quiet ink, a 44px hit (`--os-icon-hit`), and the shared focus ring. The iPhone line stays “Share → Add to Home Screen”, which is the system gesture, not a fake install. Nothing here is chain-shaped. There is no cooler NEAR-native version of a connect gate than a single clear action and a wheel you can flick without the page moving.

## 2. alignment map

Logged-out gate: `packages/onsocial-app/src/app/page.tsx` (`.gate.app-surface`), `gate-connect.tsx`, `gate-pwa-install.tsx`, `gate-dapp-rail.tsx`, `os-app-rail.tsx` (shared wheel, unchanged outside `.gate`), and the gate block in `globals.css`.

Button chrome: `@onsocial/ui` `os-dock-pill` (`os-launcher.css`) for Let’s connect, `--os-surface-fill-strong` on the element. Install uses `osCommitCancelClassName` from `os-notice-card.css` (border 0, transparent background). Focus is `--os-focus-ring`. Hit height is `--os-icon-hit`. Spacing is `--os-gutter`, `--os-dock-clearance-gap`, `--os-dock-bottom-offset`, and `env(safe-area-inset-*)`.

The install slot follows the guild hero slot idea: a reserve control is in the first paint, and standalone hides the slot with `display-mode` plus `data-pwa-standalone` set before paint. The viewport script follows `ThemeInitScript` (`useServerInsertedHTML`).

Re-scan after the text-button and wheel edits: portfolio rails still use `.gate-dapp-rail` and its margin. Only `.gate .gate-os-rail` changes height, snap padding, touch-action, and the edge fade. No second button tree.

## 3. near idioms

No wallet, account, contract, gas, or storage change. The words on the gate stay Let’s connect, Install app, and Share → Add to Home Screen. No chain wording is added. `docs/glossary.md` is not in the tree. No new term.

## 4. side effects

The gate’s box tracks `visualViewport` on resize, orientation, and visual-viewport scroll, including the centered card once the viewport is at least 640px wide (landscape phones used to pick up that card and a transform). The scroll region is a flex child with `min-height: 0`, so the wheel ends above the button stack on the first layout. In landscape the list’s snap padding uses the rail’s container height, so the list box matches the rail and cannot sit on the buttons. The edge fade is a gradient overlay. The scrolling list is not masked. Page overscroll is `none`. The wheel’s is `contain`, with `touch-action: pan-y`.

Install’s slot is reserved from the first frame and hidden in standalone before paint. Let’s connect uses `--os-dock-height` instead of a hard-coded 2.75rem. Not-found still uses `.gate` and falls back to `100dvh` when the viewport script has not run.

## 5. shipped

Let’s connect is a uniform dock fill. Install app is plain text. The wheel flicks inside its rail, snaps to a name, and leaves the logo and Let’s connect where they were. The scroll physics feel right: one gesture moves the names, the snap lands on an item, and the rest of the gate does not travel or bounce.

CLS before, measured on the old gate: iPhone 13 hint 0.018, Pixel 7 install prompt 0.024, desktop 1440×900 install prompt 0.005. After: 0 on all three, including after the prompt.

Wheel frame time p95 during a touch fling: iPhone 13 portrait 16.7ms, landscape 16.8ms, Pixel 7 portrait 33.2ms, landscape 16.8ms. Each run also recorded one or two long tasks at the start of the gesture (about 80–197ms) from input and the first layout, then frames sat on a 60Hz cadence. No overlap, no page `scrollY`, no scroll on `.gate-scroll`.

Checks: gate unit tests passed. Gate Playwright (`gate-connect`, `gate-wheel-scroll`) passed against the dev server: CLS 0, rail above the buttons, colourless install, rotation, and the four fling cases. `pnpm check:push` passed: app lint 0 errors, 501 files / 3506 unit tests, production build, Playwright 366 passed, 3 flaky, 1 skipped. One flake was this rotation assert reading the rail before the landscape rail had shrunk (535px vs a 268px stack). The assert now waits for that settle.

Screenshots: `/opt/cursor/artifacts/gate-before-*.png`, `/opt/cursor/artifacts/gate-after-*.png`. Wheel stills: `/opt/cursor/artifacts/gate-wheel/{iphone-13,pixel-7}-{portrait,landscape}/frame-01.png` through `frame-08.png`. Videos: `/opt/cursor/artifacts/gate-wheel-iphone-13-portrait.webm`, `gate-wheel-iphone-13-landscape.webm`, `gate-wheel-pixel-7-portrait.webm`, `gate-wheel-pixel-7-landscape.webm`.
