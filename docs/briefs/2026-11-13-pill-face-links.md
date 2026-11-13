## 1. best-in-class call

The swipe-up pill and the social icons have to share one bottom edge, and the icons have to sit fully above that edge. On an Android phone the fixed dock sits on the visual viewport (URL bar, gesture bar, installed app) while the face was `100dvh`, which can run past that edge. PR #746 sized `.portfolio-face-slot` from the frame bottom and clipped the stack there. The pill is anchored to the dock. When those bottoms diverge, the slot stays put and the pill climbs into the links. Clipping the stack only hides the covered half of an icon. The icon is still not usable.

The face is a locked card. A wheel or a swipe opens the page drawer; the face itself does not scroll. Short viewports already give space back by tightening the hero, not by adding a scroller. The hero inset is now a band (`--portfolio-content-start`) that keeps its full height when the column has room and shrinks toward `--portfolio-hero-min` when the pill footprint leaves less. The icons, the bio, and the name stay whole above the slot. The footprint is still one token, `--portfolio-pill-footprint`, and the frame height and the dock’s `bottom` still come from the visual viewport script.

A visitor with no published articles does not get a Writing door or an empty shelf. The owner still gets Writing, and the shelf they already have: “Longer pieces live here.” and Write an article. The count is the shelf’s own `fetchAuthorArticleWindow`. Unknown stays the old rule and does not flip after paint. A deep link to `/@id/writing` with a confirmed empty shelf sends a visitor to the face.

## 2. alignment map

Pill, slot, and hero band: `packages/onsocial-app/src/app/globals.css` (`.portfolio-frame`, `.portfolio-hero-band`, `.portfolio-face-slot`, `.portfolio-summon-dock`). The band is mounted in `portfolio-shell.tsx`. Viewport edge: `packages/onsocial-app/src/lib/gate-viewport.ts`, inserted from `theme-init-script.tsx`.

Writing door: `portfolio-depth-links.tsx`, `portfolio-writing-link.tsx`, `portfolio-account-face.tsx`, `load-portfolio-about.ts`. Presence: `fetchAuthorArticlePresence` in `load-portfolio-writing.ts`. Owner mark before paint: `portfolio-owner-mark.ts`. Empty shelf redirect: `writing-shelf-redirect.ts`.

Copy checked against `docs/glossary.md`. Added Longer pieces live here. and Write an article.

Tests: `portfolio-pill.spec.ts` (icon bottom at or above pill top minus `--portfolio-chevron-gap`, the icon box inside every clipping ancestor, and `elementFromPoint` on the icon centre hits the link), `portfolio-writing-entry.spec.ts`, `article-post-payload.test.ts`, `portfolio-page-entry.test.ts`.

## 3. near idioms

No contract, gas, or storage change. Open page stays the accessible name. Writing stays the shelf name. The owner’s empty shelf reuses `resolveWritingEmptyState` (`owner-cta`) and `OsEmptyAction`. It does not add a second empty component.

The grip swipe and the page swipe are unchanged. The face still does not scroll. `writing-shelf-warm` still warms the same `fetchAuthorArticleWindow`. The face does not start a second client probe.

## 4. side effects

Every portfolio face now reads the first article window on the server. A failed read is unknown, not zero.

On a short visual viewport the hero band shrinks and the name sits closer to the top of the card. The avatar’s negative margin still has `--portfolio-hero-min`, so the circle is not pushed out of the frame. Cover uses `--portfolio-cover-content-lift` as that floor. Routes that hide the pill still zero `--portfolio-face-clearance`. Desktop, where the visual viewport matches the layout viewport, keeps the full hero inset.

Client navigations do not re-run a script tag inside the writing screen. A full load of `/@id/writing` does.

## 5. shipped

The hero band shrinks instead of the stack clipping. On a cover face with X, Telegram, and GitHub icons, the same Android lift is applied on every target. Before, the frame stays `100dvh` and the dock is moved with an inline `bottom` (transition off, so WebKit and Chromium both take the full lift). The pill then covers the icons. After, the frame and the dock share the visual bottom, the band gives the space back, and each icon is fully visible and tappable: its bottom is at or above the pill top minus the 4px chevron gap, and the centre of the icon hits the link.

`fully visible` is y when the icon box sits inside every ancestor that clips and the centre hit is the link.

| Shot | Pill top | Icon bottom | Fully visible |
| --- | --- | --- | --- |
| before iPhone Chrome | 587.6 | 608 | n |
| after iPhone Chrome | 587.6 | 558.7 | y |
| before Samsung Chrome | 556.6 | 577.3 | n |
| after Samsung Chrome | 556.6 | 527.7 | y |
| before Pixel Chrome | 599.6 | 620.5 | n |
| after Pixel Chrome | 599.6 | 570.7 | y |
| before iPhone Safari | 587.6 | 608 | n |
| after iPhone Safari | 587.6 | 558.7 | y |
| before Samsung Safari | 556.6 | 577.3 | n |
| after Samsung Safari | 556.6 | 527.7 | y |
| before Pixel Safari | 599.6 | 620.5 | n |
| after Pixel Safari | 599.6 | 570.7 | y |
| before iPhone Brave (Chromium) | 587.6 | 608 | n |
| after iPhone Brave (Chromium) | 587.6 | 558.7 | y |
| before Samsung Brave (Chromium) | 556.6 | 577.3 | n |
| after Samsung Brave (Chromium) | 556.6 | 527.7 | y |
| before Pixel Brave (Chromium) | 599.6 | 620.5 | n |
| after Pixel Brave (Chromium) | 599.6 | 570.7 | y |

Samsung Safari and Pixel Brave now take the lift: computed `bottom` is 139px and 231px. Both befores cover the icons.

Visitor, zero articles: no Writing on the face; `/@id/writing` lands on the face. Owner, zero articles: Writing stays, shelf says Longer pieces live here. and Write an article. One or more articles: Writing and the shelf are unchanged.

Screenshots: `/opt/cursor/artifacts/pill-face-links/`.
