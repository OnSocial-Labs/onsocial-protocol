'use client';

import { useServerInsertedHTML } from 'next/navigation';
import { gateReturnScript } from '@/lib/gate-return';

/** Blocking return script. Runs on every document and no-ops off `/`. */
export function GateReturnScript() {
  useServerInsertedHTML(() => (
    <script
      id="onsocial-gate-return"
      dangerouslySetInnerHTML={{ __html: gateReturnScript }}
    />
  ));

  return null;
}
