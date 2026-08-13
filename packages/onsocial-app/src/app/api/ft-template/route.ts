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
  | { status: 'unconfigured'; detail: string }
  | { status: 'unknown'; template: FtTemplateIdentifier; detail: string };

function isNoGlobalContractError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const name =
    'cause' in cause &&
    cause.cause &&
    typeof cause.cause === 'object' &&
    'name' in cause.cause
      ? String((cause.cause as { name?: unknown }).name ?? '')
      : '';
  const message =
    'message' in cause ? String((cause as { message?: unknown }).message ?? '') : '';
  return (
    name === 'NO_GLOBAL_CONTRACT_CODE' ||
    message.toLowerCase().includes('no global contract') ||
    message.toLowerCase().includes('global contract')
  );
}

async function probeTemplate(
  template: FtTemplateIdentifier
): Promise<'ready' | 'missing' | 'unknown'> {
  const rpc = createConfiguredNearRpc({
    network: ACTIVE_NEAR_NETWORK,
    publicOnly: false,
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  const params =
    template.kind === 'codeHash'
      ? {
          request_type: 'view_global_contract_code',
          finality: 'final',
          code_hash: template.codeHash,
        }
      : {
          request_type: 'view_global_contract_code_by_account_id',
          finality: 'final',
          account_id: template.accountId,
        };

  const res = await rpc.call<{ hash?: string; code_base64?: string }>(
    'query',
    params
  );

  if (res.error) {
    if (isNoGlobalContractError(res.error)) return 'missing';
    return 'unknown';
  }
  if (res.result?.code_base64 || res.result?.hash) return 'ready';
  return 'missing';
}

export async function GET() {
  const template = resolveFtTemplateIdentifier();
  if (!template) {
    const body: TemplateStatus = {
      status: 'unconfigured',
      detail:
        'Set NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH (preferred) or NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT after publishing token-onsocial as a global contract.',
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
          'Global token template is not published on this network yet. Publish token-onsocial (CodeHash preferred), then set the matching env.',
      };
      return NextResponse.json(body);
    }
    if (probe === 'unknown') {
      const body: TemplateStatus = {
        status: 'unknown',
        template,
        detail: 'Could not verify the global token template. Try again shortly.',
      };
      return NextResponse.json(body);
    }
    const body: TemplateStatus = { status: 'ready', template };
    return NextResponse.json(body);
  } catch {
    const body: TemplateStatus = {
      status: 'unknown',
      template,
      detail: 'Could not verify the global token template. Try again shortly.',
    };
    return NextResponse.json(body);
  }
}
