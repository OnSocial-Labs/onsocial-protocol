import localFont from 'next/font/local';

// Files and license: public/fonts/README.md.
// `display: 'optional'` paints the file when the preload is ready and does
// not swap onto the metric fallback later. The unicode-range is the latin
// block the Google CSS API returned. It has to be an inline literal — the
// next/font transform does not evaluate constants.
export const publicSans = localFont({
  src: '../../public/fonts/public-sans/public-sans-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-public-sans',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const ibmPlexSans = localFont({
  src: [
    {
      path: '../../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ibm-plex-sans/ibm-plex-sans-latin-wght-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-ibm-plex-sans',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    { prop: 'font-stretch', value: '100%' },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const spaceGrotesk = localFont({
  src: '../../public/fonts/space-grotesk/space-grotesk-latin-wght-normal.woff2',
  weight: '300 700',
  style: 'normal',
  variable: '--font-space-grotesk',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const jetbrainsMono = localFont({
  src: '../../public/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  variable: '--font-jetbrains-mono',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const newsreader = localFont({
  src: [
    {
      path: '../../public/fonts/newsreader/newsreader-latin-wght-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/newsreader/newsreader-latin-wght-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/newsreader/newsreader-latin-wght-normal.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-newsreader',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Times New Roman',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const caveat = localFont({
  src: [
    {
      path: '../../public/fonts/caveat/caveat-latin-wght-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/caveat/caveat-latin-wght-normal.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/caveat/caveat-latin-wght-normal.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../public/fonts/caveat/caveat-latin-wght-normal.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-caveat',
  display: 'optional',
  preload: true,
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const ericaType = localFont({
  src: [
    {
      path: '../../public/fonts/erica-type/erika_type-webfont.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/erica-type/erika_type_b-webfont.woff',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-erica-type',
  display: 'optional',
  adjustFontFallback: 'Arial',
});
