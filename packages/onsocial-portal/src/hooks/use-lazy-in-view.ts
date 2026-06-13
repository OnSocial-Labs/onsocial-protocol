'use client';

import { useEffect, useRef, useState } from 'react';

export function useLazyInView(options?: {
  rootMargin?: string;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const enabled = options?.enabled !== false;
  const rootMargin = options?.rootMargin ?? '280px 0px';

  useEffect(() => {
    if (!enabled || inView) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setInView(true);
        observer.disconnect();
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, inView, rootMargin]);

  return { ref, inView };
}
