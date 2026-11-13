## 1. best-in-class call

The swipe-up pill is a control for one gesture. It shows only where that gesture opens the page drawer, and the last line of the face ends above it. The status toast stays a readable chip in every mood. Success and error color the icon, the halo, and the progress bar. The fill does not change.

The gesture already lived in one place: `portfolioSwipeOpensPage` is the same test as `isPortfolioFaceHref`. A path is the portfolio face when it is `/@id` and nothing after that. Writing, About, Standing, a post, and Home are not. The pill, the grip swipe, and the wheel and touch listener all call that function. A shelf that keeps the face mounted cannot leave the button up. On those shelves the button was still painted and `pointer-events` was `none`, so it looked tappable and did nothing.

The face reserves the pill in the first paint. `PortfolioShell` adds `is-portfolio-swipe` from the same function while it renders, including on the server. The hero stack clips. A slot under the stack is the dock clearance, minus the dock gap that clearance already counts, plus the shelf pulls, plus `--portfolio-face-clearance` (pill height, the gap above the dock, and the focus ring). Without `is-portfolio-swipe` the token is `0px`, so the slot does not keep the pill’s footprint. Nothing in that decision waits for hydration.

The toast fill is `--glass-surface-solid` (`--surface-solid`), and the shadow is `--os-chrome-elev-shadow`. It does not use `--os-dock-fill`, which is mood-tinted. Success and error repeat that same fill. Reduced transparency keeps the solid and drops the blur. The pending mark is `rgb(var(--fg-rgb))` in the same `1rem` box as the check and the error mark, spinning around the center of that box.

A second pill, a measured margin after paint, or a mood wash on the toast would drift from the dock and the kit.

## 2. alignment map

Gesture: `packages/onsocial-app/src/lib/portfolio-feed-reveal.ts` (`portfolioSwipeOpensPage`). `isPortfolioFaceHref` in `packages/onsocial-app/src/features/home/post-thread-layer.tsx` calls it.

Pill and grip swipe: `packages/onsocial-app/src/components/portfolio/portfolio-summon-dock.tsx`.

Page swipe: `packages/onsocial-app/src/components/portfolio/portfolio-drawer-scroll-trigger.tsx`.

First paint: `packages/onsocial-app/src/components/portfolio/portfolio-shell.tsx` (`is-portfolio-swipe`, hero stack, face slot).

Tokens: `packages/onsocial-app/src/app/globals.css`. `--portfolio-face-clearance` stays next to the chevron sizes. The slot uses `--portfolio-dock-clearance`, `--os-dock-clearance-gap`, `--portfolio-shelf-pull`, `--portfolio-shelf-meta-gap`, and `--portfolio-face-clearance`. A frame without `is-portfolio-swipe` sets the clearance token to `0px`.

Toast: `packages/onsocial-app/src/app/transaction-feedback-toast.css`. The button rule in `.cursor/rules/app-button-toast-contract.mdc` names the same fill.

Tests: `portfolio-feed-reveal.test.ts`, `portfolio-page-entry.test.ts`, `e2e/portfolio-pill.spec.ts`.

Copy: `docs/glossary.md`. No new label. Open page, Collecting SOCIAL…, and SOCIAL collected. stay as written.

Re-scan after the edits: the dock, the scroll trigger, and the shell all call `portfolioSwipeOpensPage`. The toast file does not mention `--os-dock-fill` or a hex blue. The glossary still lists Open page as the pill’s name.

## 3. near idioms

No contract, gas, or storage change. Open page stays the accessible name on the face. Close page and Open launcher stay as they are. The toast body is unchanged. Pending still ends with `…`. There is no on-chain, hash, or gas in the chip.

Another person’s portfolio face is still a face. Swipe-up opens their page drawer, so the pill stays. Their Writing shelf is not a face, so the pill leaves.

## 4. side effects

A soft navigation onto Writing, About, or Standing drops the pill in the same render as the route. The face underneath loses the pill footprint (`--portfolio-face-clearance: 0px`). The dock clearance under that shelf stays, so the face still clears the dock.

A short face does not move. On iPhone Chrome the identity stayed at top `190.4` and bottom `372.5`. The pill stayed at top `759.6`. The gap stayed `387.1`. Avatar top stayed `190.4` on iPhone, Samsung, and Pixel.

A tall face used to paint through the pill. The stack now clips at the slot. The visible bottom sits `14.6` above the pill on every phone and browser measured below.

The toast fill is the kit solid (`rgba(12, 13, 16, 0.98)` in dark, `rgba(255, 255, 255, 0.98)` in light) instead of `bg` at `0.92`. A strong mood does not change that fill.

## 5. shipped

The pill is `24×14` on the portfolio face and absent on Writing. Another person’s face still has Open page. Their Writing shelf does not. The face slot on a tall stack ends `14.6px` above the pill. The pending spinner is white in dark (`rgb(255, 255, 255)`) and the same `16×16` box as the green and red marks.

Viewports: iPhone `390×844`, Samsung `360×800`, Pixel `412×915`. Engines: Chrome, Safari (WebKit), Brave-equivalent Chromium.

Tall face, last visible bottom versus pill top. Before the gap was negative (content under the pill). After it is `14.6` on all nine.

| Phone | Browser | Pill top | Visible bottom | Gap after |
| --- | --- | --- | --- | --- |
| iPhone | Chrome, Safari, Brave | 759.6 | 745 | 14.6 |
| Samsung | Chrome, Safari, Brave | 715.6 | 701 | 14.6 |
| Pixel | Chrome, Safari, Brave | 830.6 | 816 | 14.6 |

Before, iPhone Chrome’s last layout bottom was `1198.1` against pill top `759.6` (gap `-438.5`). Samsung was `-482.5`. Pixel was `-379.2`.

Writing and Bob’s Writing, all nine: the pill was visible with `pointer-events: none`. After, the pill count is `0` and the clearance token is `0px`. The slot falls from `98.95px` to `77px`.

Toast, all nine, same numbers. Dark pending fill moved from `rgba(0, 0, 0, 0.92)` to `rgba(12, 13, 16, 0.98)`. The mark moved from `rgb(96, 165, 250)` to `rgb(255, 255, 255)`. Light success fill is `rgba(255, 255, 255, 0.98)` and the mark stays `rgb(0, 236, 151)`. Summer (accent forced to `#ff4d00`) keeps the dark solid fill. The error mark stays `rgb(242, 92, 92)`. The pending mark stays white. Every icon box is `16×16`. Shadow is `0px 12px 36px -10px rgba(0, 0, 0, 0.52)` in dark and `0px 10px 32px -12px rgba(0, 0, 0, 0.14)` in light.

Screenshots: `/opt/cursor/artifacts/pill-toast-before/` and `/opt/cursor/artifacts/pill-toast-after/`. Names are `{chrome|safari|brave}-{iphone|samsung|pixel}-{face|face-tall|writing|other-user|toast-dark-pending|toast-dark-success|toast-dark-error|toast-light-pending|toast-light-success|toast-light-error|toast-summer-pending|toast-summer-success|toast-summer-error}.png`.

UX: phone and desktop-width engines, bottom of the face, Writing, another person’s Writing, and the chip in dark, light, and one strong mood. The chip says Collecting SOCIAL…, SOCIAL collected., or Couldn’t collect SOCIAL. No chain wording.

`pnpm check:push` exited 0. App lint reported 0 errors. Unit tests were 504 files and 3521 tests. The production build compiled. Playwright was 371 passed, 1 flaky, 1 skipped. The flaky case is the standing globe on the network map. The retry passed. It does not touch the pill or the toast.
