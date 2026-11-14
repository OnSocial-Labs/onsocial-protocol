import localFont from 'next/font/local';
import './public-sans-ext.css';

const publicSans = localFont({
  src: './public-sans-latin.woff2',
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

const ibmPlexSans = localFont({
  src: './ibm-plex-sans-latin.woff2',
  weight: '400 700',
  style: 'normal',
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

const spaceGrotesk = localFont({
  src: './space-grotesk-latin.woff2',
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

const jetbrainsMono = localFont({
  src: './jetbrains-mono-latin.woff2',
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

const newsreader = localFont({
  src: './newsreader-latin.woff2',
  weight: '400 600',
  style: 'normal',
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

const caveat = localFont({
  src: './caveat-latin.woff2',
  weight: '400 700',
  style: 'normal',
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

const ericaType = localFont({
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

export {
  publicSans,
  ibmPlexSans,
  spaceGrotesk,
  jetbrainsMono,
  newsreader,
  caveat,
  ericaType,
};
