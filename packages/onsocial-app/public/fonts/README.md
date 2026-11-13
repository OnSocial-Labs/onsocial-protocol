# Vendored app fonts

`next/font` loads these woff2 files from the repo. The production build does not call fonts.googleapis.com or fonts.gstatic.com.

Each file is the **latin** woff2 the Google Fonts CSS API returned on 2026-11-13 for the same request `next/font/google` makes (Chrome 104 user agent, `display=optional`). That is the file the app was already shipping at build time. The version in the URL is the [google/fonts](https://github.com/google/fonts) tag. `@fontsource-variable/*@5.3.0` is the same upstream version; its latin file has the same glyph outlines and advances. These bytes are the API files so Chromium rasterization stays on the file users already had.

License: SIL Open Font License 1.1. The license text is [OFL.txt](./OFL.txt). Erica Type stays in `erica-type/` with its own OFL copy.

| File                                                    | Family         | Axis                                           | google/fonts            | Copyright                                                                                          |
| ------------------------------------------------------- | -------------- | ---------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `public-sans/public-sans-latin-wght-normal.woff2`       | Public Sans    | wght 100–900                                   | `ofl/publicsans` v21    | Copyright 2015 The Public Sans Project Authors (https://github.com/uswds/public-sans)              |
| `ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2`   | IBM Plex Sans  | wght 100–700, registered at 400, 500, 600, 700 | `ofl/ibmplexsans` v23   | Copyright 2019 IBM Corp. All rights reserved.                                                      |
| `space-grotesk/space-grotesk-latin-wght-normal.woff2`   | Space Grotesk  | wght 300–700                                   | `ofl/spacegrotesk` v22  | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) |
| `jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | wght 100–800                                   | `ofl/jetbrainsmono` v24 | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)     |
| `newsreader/newsreader-latin-wght-normal.woff2`         | Newsreader     | wght 200–800, registered at 400, 500, 600      | `ofl/newsreader` v26    | Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader)        |
| `caveat/caveat-latin-wght-normal.woff2`                 | Caveat         | wght 400–700, registered at 400, 500, 600, 700 | `ofl/caveat` v23        | Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat)                  |

`next/font/google` also downloaded latin-ext and other subsets and only preloaded latin. Those other subsets are not vendored. Latin text is the product. Characters outside the latin unicode-range use the metric fallback.

CSS API requests (latin file only; other subsets are not vendored):

- Public Sans `https://fonts.googleapis.com/css2?family=Public+Sans:wght@100..900&display=optional`
- IBM Plex Sans `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=optional`
- Space Grotesk `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=optional`
- JetBrains Mono `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@100..800&display=optional`
- Newsreader `https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&display=optional`
- Caveat `https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=optional`
