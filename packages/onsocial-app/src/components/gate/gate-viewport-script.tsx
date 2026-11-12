'use client';

import { useLayoutEffect } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { gateViewportScript } from '@/lib/gate-viewport';

/**
 * Blocking viewport script on the first response, plus a layout effect so a
 * client navigation to the gate still tracks orientation.
 */
export function GateViewportScript() {
  useServerInsertedHTML(() => (
    <script
      id="onsocial-gate-viewport"
      dangerouslySetInnerHTML={{ __html: gateViewportScript }}
    />
  ));

  useLayoutEffect(() => {
    if (document.documentElement.dataset.gateViewport === '1') return;
    const script = document.createElement('script');
    script.id = 'onsocial-gate-viewport';
    script.text = gateViewportScript;
    document.head.appendChild(script);
  }, []);

  return null;
}
