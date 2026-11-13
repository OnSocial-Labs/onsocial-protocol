## 1. best-in-class call

The installed icon is one black tile. Android crops it to a circle or a squircle, iOS masks the Apple touch icon to a squircle, and a desktop install may show the square. The glyph has to sit in the middle of its own box, with enough black around it that every crop still reads as the mark. The old art filled about 69% of the canvas and sat 1.4% high because of the tail, so the maskable crop looked oversized and the `any` and Apple icons showed transparent corners.

Best-in-class here is two icons from one path. Maskable art is full-bleed `#000` with the glyph box at 50% of the canvas, inside the 80% safe zone. `any` and the Apple touch icon are the same black field with the glyph at about 56% and 55%, and with no baked radius. iOS has no splash of its own, so each current portrait size gets a black startup image with the same centred mark. Android already builds the splash from the manifest: black field, the maskable icon, and the name.

Product decision: an installed app with no stored theme stays dark. The splash is black. The first frame stays black, including on a light-mode phone, and the dark bar stays locked so a later system change does not flip the canvas to white. A stored Light or Dark choice still wins, in the browser and in the install. A browser tab with no stored choice still follows the system. That split is the call. The installed tile is black, so the launch continues the tile until the person picks Light.

## 2. alignment map

Icon source and generator: `packages/onsocial-app/public/onsocial_icon_maskable.svg`, `scripts/gen-icons.mjs` (`pnpm gen:icons`). Outputs: `onsocial_icon_192.png`, `onsocial_icon_512.png`, `onsocial_icon_maskable_192.png`, `onsocial_icon_maskable_512.png`, `apple-touch-icon.png`, and `public/apple-splash/*.png`. The link list is `src/lib/apple-startup-images.ts`. Geometry is asserted in `src/lib/pwa-icons.test.ts` with the same ink threshold as the generator (`32`).

Manifest and chrome: `src/app/manifest.ts` (`background_color` and `theme_color` `#000000`, maskable 192 and 512). `src/app/layout.tsx` keeps the SVG favicon and the Apple touch icon, and sets `appleWebApp.startupImage` from that list. Viewport `themeColor` stays `THEME_BAR_LIGHT` / `THEME_BAR_DARK` (`#ffffff` / `#0c0d10`).

Launch: `src/lib/theme-init.ts` and `theme-init.test.ts`. `ThemeInitScript` is still the one blocking insertion, with the gate return script beside it. The toggle still writes `onsocial.theme` and `data-theme`. The shell cache is `onsocial-app-shell-v4` and precaches the maskable 192.

Re-scan after the edits: the blocking script still paints `data-theme`, `color-scheme`, and the canvas before first paint. A stored choice still locks every `theme-color` meta. A browser tab with no stored choice still leaves both media colors and still follows a system change. Only the installed path with no stored choice is new. Portal and labs icons are untouched. `onsocial_icon.svg` is still the in-app mark. The unreferenced rounded source `onsocial_icon_app.svg` is removed.

## 3. near idioms

No wallet, account, contract, gas, or storage change. The manifest name stays `OnSocial` on mainnet and `OnSocial Testnet` otherwise. `short_name` stays `OnSocial`. `docs/glossary.md` is not on main. The pill PR creates it, so these names were not checked against a glossary. No new term.

## 4. side effects

Android install uses the maskable icon. The glyph sits in the safe zone, so a circle or squircle crop no longer clips the tail. The WebAPK splash field is `#000`, matching `theme_color`, and the label is the manifest name (`OnSocial Testnet` off mainnet). After that splash, a phone with no stored theme paints the dark canvas (`#000`) and the existing dark bar (`#0c0d10`). The bar is the dark chrome from the theme script, a step from pure black once the document is up.

iOS uses the full-bleed touch icon and applies its own squircle. Portrait startup images are the distinct sizes in `@vite-pwa/assets-generator` `appleSplashScreenSizes` (the list that cites Apple's HIG device screen dimensions): iPhone 11 through 17 Pro Max, iPhone Air, iPhone SE 4.7-inch, iPad Pro 12.9-inch and 11-inch, iPad Air 13-inch, 11-inch, and 10.9-inch, iPad 11-inch, and iPad mini 8.3-inch. iPhone Duo is not in that list or in the HIG device tables, so it has no image. The M4 iPad Pro point sizes are not in that list either. Landscape, Display Zoom, and iPad Split View have no image, so those launches stay on the system blank. `statusBarStyle` stays `black-translucent`, over the black image.

Desktop install uses the `any` icons: a black square, glyph about 56%, opaque corners. A circle crop of that square still contains the mark. A browser tab that is not installed still follows the system, so a light desktop tab stays light. An installed desktop window with no stored theme stays dark, same as the phone.

The service worker drops the previous icon cache on activate. Startup images are not precached. A stored Light choice in the install still paints light, and the toggle still shows that choice.

## 5. shipped

Maskable glyphs measure at half the canvas and inside the safe-zone circle. `any` glyphs sit between 55% and 58%. The Apple touch icon sits at about 55%, with opaque black corners. Every startup image is opaque black, and the mark is centred at about 24% of the shorter side. The old icons were about 69% of the canvas, the farthest ink at about 72% of the half-width, and the `any` and Apple corners were transparent.

Chromium, 390×844, the real theme script: a standalone light-mode phone with nothing stored painted `data-theme=dark`, canvas `rgb(0, 0, 0)`, and both `theme-color` metas `#0c0d10`. The same case on the previous script painted light, canvas `rgb(255, 255, 255)`, and left the media colors. A normal light tab still paints light and leaves both media colors. `navigator.standalone` with nothing stored paints dark. A stored light choice in standalone still paints light.

`pnpm check:push` exited 0. App lint was 0 errors (37 existing warnings). Unit tests were 504 files and 3519 tests. The production build compiled. Playwright was 365 passed, 4 flaky, 1 skipped. The flakes are the open-drop supply locator, the launcher grip drag, and two portfolio identity locators that match two nodes. The retry passes.

Screenshots: `/opt/cursor/artifacts/pwa-icons/`.
