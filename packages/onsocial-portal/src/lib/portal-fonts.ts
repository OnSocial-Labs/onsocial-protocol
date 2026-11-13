import localFont from 'next/font/local';

export const DmSans = localFont({
  src: '../../public/fonts/dm-sans/dm-sans-latin-wght-normal.woff2',
  weight: '100 1000',
  style: 'normal',
  variable: '--font-dm-sans',
  display: 'swap',
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

export const portalFontVariableClassName = DmSans.variable;
