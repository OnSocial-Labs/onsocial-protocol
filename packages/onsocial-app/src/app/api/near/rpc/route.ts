import { NextResponse } from 'next/server';

import {
  handleNearJsonRpcPost,
  READ_ONLY_NEAR_RPC_METHOD_SET,
  type NearJsonRpcRequest,
} from '@onsocial/rpc';

import { isAppNearRpcRequestAuthorized } from '@/lib/app-near-rpc-auth';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { getServerNearRpc } from '@/server/near-rpc-bff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isAppNearRpcRequestAuthorized(request)) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: 'onsocial-bff',
        error: { code: 403, message: 'Forbidden' },
      },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json()) as
      | NearJsonRpcRequest
      | NearJsonRpcRequest[];

    const result = await handleNearJsonRpcPost(body, {
      allowedMethods: READ_ONLY_NEAR_RPC_METHOD_SET,
      defaultNetwork: ACTIVE_NEAR_NETWORK,
      getRpc: getServerNearRpc,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RPC proxy failed';
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: 'onsocial-bff',
        error: { code: -32000, message },
      },
      { status: 502 }
    );
  }
}
