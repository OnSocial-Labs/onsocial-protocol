'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TokenRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/transparency');
  }, [router]);

  return null;
}
