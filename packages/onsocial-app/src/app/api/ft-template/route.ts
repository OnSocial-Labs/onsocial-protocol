import { NextResponse } from 'next/server';
import {
  resolveFtTemplateIdentifier,
  type FtTemplateIdentifier,
} from '@/lib/app-ft-template-config';
import { getActiveServerNearRpc } from '@/server/near-rpc-bff';

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
    'message' in cause
      ? String((cause as { message?: unknown }).message ?? '')
      : '';
  return (
    name === 'NO_GLOBAL_CONTRACT_CODE' ||
    message.toLowerCase().includes('no global contract') ||
    message.toLowerCase().includes('global contract')
  );
}

async function probeTemplate(
  template: FtTemplateIdentifier
): Promise<'ready' | 'missing' | 'unknown'> {
  const rpc = getActiveServerNearRpc();
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

  try {
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
  } catch (cause) {
    if (isNoGlobalContractError(cause)) return 'missing';
    return 'unknown';
  }
}

export async function GET() {
  const template = resolveFtTemplateIdentifier();
  if (!template) {
    const body: TemplateStatus = {
      status: 'unconfigured',
      detail:
        'Publish token-onsocial as a global contract, then set NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH.',
    };
    return NextResponse.json(body);
  }

  const probe = await probeTemplate(template);
  if (probe === 'ready') {
    return NextResponse.json({ status: 'ready', template } satisfies TemplateStatus);
  }
  if (probe === 'missing') {
    return NextResponse.json({
      status: 'missing',
      template,
      detail: 'That global contract is not published on this network yet.',
    } satisfies TemplateStatus);
  }
  return NextResponse.json({
    status: 'unknown',
    template,
    detail: 'Could not verify the token template.',
  } satisfies TemplateStatus);
}
