import { NextResponse } from 'next/server';
import type { FtFactoryFinishInput } from '@/lib/ft-factory-client';
import { readFactoryPublicKey, runFactoryFinish } from '@/server/ft-factory';
import type { FactoryFinishCode } from '@/server/ft-factory-tx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusFor(code: FactoryFinishCode): number {
  if (code === 'not-ready') return 503;
  if (code === 'invalid') return 400;
  if (code === 'refused') return 409;
  return 502;
}

export async function GET() {
  const publicKey = readFactoryPublicKey();
  if (!publicKey) return NextResponse.json({ ready: false });
  return NextResponse.json({ ready: true, publicKey });
}

export async function POST(request: Request) {
  let body: Partial<FtFactoryFinishInput>;
  try {
    body = (await request.json()) as Partial<FtFactoryFinishInput>;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid JSON body',
        retryable: false,
        code: 'invalid',
      },
      { status: 400 }
    );
  }

  const result = await runFactoryFinish({
    createTxHash:
      typeof body.createTxHash === 'string' ? body.createTxHash : '',
    contractId: typeof body.contractId === 'string' ? body.contractId : '',
    name: typeof body.name === 'string' ? body.name : '',
    symbol: typeof body.symbol === 'string' ? body.symbol : '',
    totalSupply: typeof body.totalSupply === 'string' ? body.totalSupply : '',
    icon: typeof body.icon === 'string' ? body.icon : '',
    renounceOwner: body.renounceOwner === true,
  });

  if (result.ok) return NextResponse.json(result);
  return NextResponse.json(result, { status: statusFor(result.code) });
}
