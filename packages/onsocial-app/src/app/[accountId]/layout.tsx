import type { ReactNode } from 'react';

export default function AccountLayout({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay: ReactNode;
}) {
  return (
    <>
      {children}
      {overlay}
    </>
  );
}
