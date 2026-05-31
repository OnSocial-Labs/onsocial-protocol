import { DM_Sans } from 'next/font/google';

export const DmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const portalFontVariableClassName = DmSans.variable;
