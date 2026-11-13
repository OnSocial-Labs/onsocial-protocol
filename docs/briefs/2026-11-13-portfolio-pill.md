## 1. best-in-class call

The logged-in portfolio face should be finished on the first paint. The swipe-up control is a small frosted pill above the dock, and the hero already leaves room for it. Nothing in the identity moves when React hydrates.

The control today is `PortfolioPageContentEntry` (`packages/onsocial-app/src/components/portfolio/portfolio-page-entry.tsx`). It is a real button named Open page, with `ChevronUpIcon` and the `.os-dock-pill` class. The box is still the nav avatar, `--os-avatar-nav` (1.85rem, 29.6px), and the glyph is 1.75rem. At that size the chevron fills the frost, so the control reads as a bare mark sitting 0.25rem above the dock. The tap target is the same 29.6px box.

`useChevronFaceClearance` measures that box after hydration and, when the face stack crosses the focus ring, writes `margin-top` on `.portfolio-identity`. The face is top-aligned. Bottom padding cannot lift a stack that is already taller than the screen, which is why the hook exists. The write happens in `useLayoutEffect` after the server paint, so a tall face jumps.

Shrink the control to a pill, 1.5rem by 0.875rem (24×14), padding 0, radius 9999px, the same radius `.os-dock-pill` already uses. Fill stays the dock frost: `--os-dock-fill`, the `::before` blur, `--os-dock-shadow`, and `--os-dock-lip` from `packages/onsocial-ui/os-launcher.css`. No new colour. The glyph stays `ChevronUpIcon`. In a 0.75rem (12px) box the 24-viewBox stroke is doubled to 4 user units so the ink is a 2px stroke, about 10×6 once the stroke is counted. Ink is `--fg-rgb` at opacity 0.78, the mute the stroke icons already use. Opaque colour plus opacity, not a translucent stroke.

The visible pill stays small. An invisible `::after` is the tap layer, `--portfolio-chevron-hit` (2.75rem, 44px). It sits `bottom: -0.25rem` and is centered, so the inset is about -1.625rem -0.625rem -0.25rem. That is the asked -1.45rem -0.5rem -0.25rem, tightened so the layer is exactly 44px and its bottom edge meets the dock instead of covering it. `.os-dock-pill` sets `overflow: hidden`, which would clip this layer. The chevron rule is unlayered and sets `overflow: visible`. The frost stays on `::before`.

The slot is the pill plus the 0.25rem gap above the dock (1.125rem, 18px), plus the 4px focus ring. Those are `--portfolio-chevron-slot` and `--portfolio-face-clearance`. The hero’s bottom padding already reserves the old 1.85rem chevron. It now reserves `--portfolio-face-clearance` instead, in the same formula: dock clearance, minus the dock gap that already covers part of the stack, plus the shelf pull. First paint includes the slot. The hook and its inline margin go away.

Browser: the pill is centered on the dock, the 4px ring is the existing two-layer shadow (`2px` canvas gap, `4px` ink), and keyboard users still land on Open page. A tucked dock still reveals on `:focus-within`. Mobile: the same CSS box, with the 44px layer larger than the pill so the thumb does not have to hit 14px. `prefers-reduced-motion` clears the button, the frost, the glyph, and the hit layer. `prefers-reduced-transparency` keeps the solid glass fill already on the chevron `::before`.

A second chevron component, or a hard-coded fill, would drift from the dock. Measuring the overlap in JS would bring the jump back.

## 2. alignment map

Pill: `packages/onsocial-app/src/components/portfolio/portfolio-page-entry.tsx`. Classes stay `os-dock-pill` and `portfolio-page-chevron`. Name stays Open page.

Dock host: `packages/onsocial-app/src/components/portfolio/portfolio-summon-dock.tsx`. Drops the clearance hook. The grip’s pointer swipe is a different gesture and stays here.

Tokens and hero padding: `packages/onsocial-app/src/app/globals.css`, next to `--portfolio-content-width` and the hero’s bottom padding. Chevron box, glyph, hit layer, focus, and reduced motion stay in the unlayered chevron block at the end of that file, because `.glass-sheet-icon-action` and `.os-dock-pill` are unlayered and a layered rule cannot beat them.

Frost, read only: `packages/onsocial-ui/os-launcher.css` (`.os-dock-pill` and `::before`).

Delete: `packages/onsocial-app/src/hooks/use-chevron-face-clearance.ts` and the call in the summon dock.

Tests: `packages/onsocial-app/e2e/drawer-pull-gestures.spec.ts` (the old 30px box), `packages/onsocial-app/e2e/portfolio-pill.spec.ts` (identity top stable, 44px hit), `packages/onsocial-app/src/components/portfolio/portfolio-page-entry.test.ts` (button contract and the slot tokens).

Copy: `docs/glossary.md`. The label checked against it is Open page.

Re-scan after the edits: the summon dock still owns launcher swipe, scroll-hide, and write mode. The page drawer still opens from this button, from the wheel and touch path in `portfolio-drawer-scroll-trigger.tsx`, and from `#portfolio-feed`. No second pill, no second clearance.

## 3. near idioms

No contract, gas, or storage change. Open page stays the accessible name. Close page on the drawer and Open launcher on the grip stay as they are. The glossary records that pattern: a plain verb and a plain noun, no chain wording.

The grip swipe (`SWIPE_UP_PX` 28, then open the launcher and swallow the click) and the page swipe (wheel and touch call `shouldRevealPortfolioFeed`) are not the same gesture. There is no second copy of the grip’s pointer math. `useSwipeUpOpen` is not added.

## 4. side effects

Every portfolio face loses the post-hydration margin write, including visitors and the owner. The hero’s bottom padding shrinks by the difference between the 1.85rem chevron and the 18px slot. Top-aligned content does not move. A face that used to be pulled up by the hook now keeps the CSS position, including at a 32px root font, as long as the reserved padding still clears the standing line.

The 44px hit layer extends above the pill into empty face space. It does not extend below the dock. Concealed and write states still set `pointer-events: none` on the button, which covers the layer.

Before this change, full-load CLS on `/@alice.testnet` signed in as alice.testnet was 0, 0, 0 on desktop 1440×900, 0, 0, 0 on iPhone 13, and 0, 0, 0 on Pixel 7. The stack on that face ends well above the chevron, so the hook’s margin stayed empty. The jump the hook can still produce is the tall-face case, which the CSS slot replaces.

The launcher grip drag on `/home` was already racing `os-launcher-sheet-in` on main; the spec now waits until that enter state is gone and the grip is inside the viewport.

## 5. shipped

The control is a 24×14 pill (`border-radius: 9999px`, padding 0) with the dock frost on `::before` (`blur(20px) saturate(1.3)`). The glyph box is 12px, opacity 0.78, stroke 2px. The hit layer measures 44×44. Inline `margin-top` on `.portfolio-identity` stays empty. Open page is still the accessible name, with the same 2px/4px focus ring.

The 44px layer is wider than the old 30px mark, and the dock paints above a hug sheet, so the layer covered Discard on the message confirm. While a `.glass-sheet-root` is open the pill takes no pointer events. The face hit stays 44px.

Browser and phone: the pill sits centered on the dock, clear of the grip, and the identity does not move into it. The chevron reads as a small caret, not a second dock. Screenshots: `/opt/cursor/artifacts/portfolio-pill-before/` and `/opt/cursor/artifacts/portfolio-pill-after/`.

CLS on `/@alice.testnet` signed in as alice.testnet, three runs each. Before: desktop 0, 0, 0; iPhone 13 0, 0, 0; Pixel 7 0, 0, 0. After: desktop 0, 0, 0; iPhone 13 0, 0, 0; Pixel 7 0, 0, 0. On that face the old hook never wrote a margin, because the stack ends above the chevron. The jump it could still write is gone with the hook.

`pnpm check:push` exited 0. App lint and typecheck passed. Unit tests were 503 files and 3512 tests. The production build compiled. Playwright was 365 passed, 5 flaky, 2 skipped. The flaky cases are the tucked chevron, the chevron hidden while writing, the launcher grip drag, the standing globe, and the organisation location drawer. Each retry passed. They see two docks or two identities in the same moment, the skeleton and the resolved face.
