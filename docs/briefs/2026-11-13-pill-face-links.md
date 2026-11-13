## 1. best-in-class call

The swipe-up pill and the social icons have to share one bottom edge. On an Android phone the fixed dock sits on the visual viewport (URL bar, gesture bar, installed app) while the face was `100dvh`, which can run past that edge. PR #746 sized `.portfolio-face-slot` from the frame bottom. The pill is anchored to the dock (`bottom: calc(100% + var(--portfolio-chevron-gap))`). When those bottoms diverge, the slot stays put and the pill climbs into the links. A tall face with no icons never reached that band, so the earlier tests stayed green.

The footprint is one token on the frame, `--portfolio-pill-footprint` (pill height + gap + focus ring + the shelf pulls). The slot height is the dock chrome plus that footprint. The frame height and the dock’s `bottom` both come from the visual viewport script, so a lifted dock lifts the face with it. Nothing in the stack can paint under the pill, and the first frame already has the numbers.

A visitor with no published articles does not get a Writing door or an empty shelf. The owner still gets Writing, and the shelf they already have: “Longer pieces live here.” and Write an article. The count is the shelf’s own `fetchAuthorArticleWindow`. Unknown stays the old rule (owner sees the door, visitor does not) and does not flip after paint. A deep link to `/@id/writing` with a confirmed empty shelf sends a visitor to the face.

## 2. alignment map

Pill and slot: `packages/onsocial-app/src/app/globals.css` (`.portfolio-frame`, `.portfolio-face-slot`, `.portfolio-summon-dock`). Viewport edge: `packages/onsocial-app/src/lib/gate-viewport.ts`, inserted from `theme-init-script.tsx` so the portfolio has it before paint.

Writing door: `portfolio-depth-links.tsx`, `portfolio-writing-link.tsx`, `portfolio-account-face.tsx`, `load-portfolio-about.ts`. Presence: `fetchAuthorArticlePresence` in `load-portfolio-writing.ts`. Owner mark before paint: `portfolio-owner-mark.ts`. Empty shelf redirect: `writing-shelf-redirect.ts` on the writing page and the overlay route.

Copy checked against `docs/glossary.md`. Added Longer pieces live here. and Write an article.

Tests: `portfolio-pill.spec.ts`, `portfolio-writing-entry.spec.ts`, `article-post-payload.test.ts`, `portfolio-page-entry.test.ts`.

## 3. near idioms

No contract, gas, or storage change. Open page stays the accessible name. Writing stays the shelf name. The owner’s empty shelf reuses `resolveWritingEmptyState` (`owner-cta`) and `OsEmptyAction`. It does not add a second empty component.

The grip swipe and the page swipe are unchanged. `writing-shelf-warm` still warms the same `fetchAuthorArticleWindow`. The face does not start a second client probe that could pop the door in.

## 4. side effects

Every portfolio face now reads the first article window on the server. A failed read is unknown, not zero, so a visitor is not sent off a shelf that might have articles, and the owner is not invited to write a first article we failed to load.

Routes that hide the pill still zero `--portfolio-face-clearance`, and the footprint recomputes on the frame. The gate viewport script also publishes the portfolio edge. Desktop, where the visual viewport matches the layout viewport, keeps `bottom: 0` and a `100dvh`-sized frame.

Client navigations do not re-run a script tag inside the writing screen. A full load of `/@id/writing` does. That is the deep link.

## 5. shipped

The slot and the pill share the visual bottom. On a cover face with X, Telegram, and GitHub icons, lifting the dock by the gap plus 20px (the Android case: frame still `100dvh`, dock up on the visual viewport) paints the pill on the icons. The same lift after the fix does not: `elementFromPoint` on the pill hits neither the icons, the bio, nor the name.

Painted check is `hit`. `iconGap` is pill top minus the icon’s layout bottom. A negative gap with `hit: clear` means the icon box runs into the clip and the pixels stop above the pill.

| Shot | Lift | Pill top | Icon bottom | iconGap | Painted |
| --- | --- | --- | --- | --- | --- |
| before iPhone Chrome | 172 | 629.6 | 608 | 21.6 | clear |
| after iPhone Chrome | 172 | 587.6 | 608 | -20.4 | clear |
| before Samsung Chrome | 139 | 558.1 | 577.3 | -19.2 | link |
| after Samsung Chrome | 139 | 556.6 | 577.3 | -20.7 | clear |
| before Pixel Chrome | 231 | 624 | 620.5 | 3.5 | link |
| after Pixel Chrome | 231 | 599.6 | 620.5 | -20.9 | clear |
| before iPhone Safari | 172 | 598.3 | 608 | -9.7 | link |
| after iPhone Safari | 172 | 587.6 | 608 | -20.4 | clear |
| before Samsung Safari | 139 | 695.6 | 577.3 | 118.3 | clear |
| after Samsung Safari | 139 | 556.6 | 577.3 | -20.7 | clear |
| before Pixel Safari | 231 | 612.8 | 620.5 | -7.7 | link |
| after Pixel Safari | 231 | 599.6 | 620.5 | -20.9 | clear |
| before iPhone Brave (Chromium) | 172 | 587.8 | 608 | -20.2 | link |
| after iPhone Brave (Chromium) | 172 | 587.6 | 608 | -20.4 | clear |
| before Samsung Brave (Chromium) | 139 | 557 | 577.3 | -20.2 | link |
| after Samsung Brave (Chromium) | 139 | 556.6 | 577.3 | -20.7 | clear |
| before Pixel Brave (Chromium) | 231 | 753 | 620.5 | 132.5 | clear |
| after Pixel Brave (Chromium) | 231 | 599.6 | 620.5 | -20.9 | clear |

Samsung Safari and Pixel Brave did not take the forced dock lift (the unlayered dock rule kept `bottom`), so those two befores stay clear. Every after is clear.

Visitor, zero articles: no Writing on the face; `/@id/writing` lands on the face. Owner, zero articles: Writing stays, shelf says Longer pieces live here. and Write an article. One or more articles: Writing and the shelf are unchanged.

Screenshots: `/opt/cursor/artifacts/pill-face-links/`.
