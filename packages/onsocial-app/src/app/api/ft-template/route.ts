import { NextResponse } from 'next/server';
import {
  resolveFtTemplateIdentifier,
  type FtTemplateIdentifier,
} from '@/lib/app-ft-template-config';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { createConfiguredNearRpc } from '@onsocial/rpc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TemplateStatus =
  | { status: 'ready'; template: FtTemplateIdentifier }
  | { status: 'missing'; template: FtTemplateIdentifier; detail: string }
  | { status: 'unconfigured'; detail: string };

async function probeTemplate(
  template: FtTemplateIdentifier
): Promise<'ready' | 'missing' | 'unknown'> {
  const rpc = createConfiguredNearRpc({
    network: ACTIVE_NEAR_NETWORK,
    publicOnly: false,
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  if (template.kind === 'codeHash') {
    const res = await rpc.call<{ hash?: string; code_base64?: string }>(
      'query',
      {
        request_type: 'view_global_contract_code',
        finality: 'final',
        code_hash: template.codeHash,
      }
    );
    if (res.error) {
      const name = res.error.cause?.name ?? '';
      if (name === 'NO_GLOBAL_CONTRACT_CODE') return 'missing';
      return 'unknown';
    }
    if (res.result?.code_base64 || res.result?.hash) return 'ready';
    return 'missing';
  }

  // AccountId-mode globals — probe via view_global_contract_code by account is
  // not universal; treat configured account as ready and let chain reject if missing.
  return 'ready';
}

export async function GET() {
  const template = resolveFtTemplateIdentifier();
  if (!template) {
    const body: TemplateStatus = {
      status: 'unconfigured',
      detail:
        'Set NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH or NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT.',
    };
    return NextResponse.json(body);
  }

  try {
    const probe = await probeTemplate(template);
    if (probe === 'missing') {
      const body: TemplateStatus = {
        status: 'missing',
        template,
        detail:
          'Publish token-onsocial as a global contract (code hash) before creating tokens.',
      };
      return NextResponse.json(body);
    }
    const body: TemplateStatus = { status: 'ready', template };
    return NextResponse.json(body);
  } catch {
    const body: TemplateStatus = { status: 'ready', template };
    return NextResponse.json(body);
  }
}
