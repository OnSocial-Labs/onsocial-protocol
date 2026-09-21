import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMPLIFY_CONNECT_CTA,
  AMPLIFY_CONNECT_HINT,
} from '@/features/home/amplify-voice';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, 'post-amplify-sheet.tsx'), 'utf8');

describe('amplify Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(AMPLIFY_CONNECT_CTA).toBe('Connect');
    expect(AMPLIFY_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to amplify with SOCIAL', () => {
    expect(AMPLIFY_CONNECT_HINT).toBe('Connect to amplify with SOCIAL.');
    expect(AMPLIFY_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });

  it('titles the sheet with the work line, not an author face', () => {
    expect(sheet).toContain('amplifyWorkTitle');
    expect(sheet).toContain('{...(subject ? { subject } : {})}');
    expect(sheet).not.toContain('personName=');
    expect(sheet).not.toContain('handle=');
  });
});
