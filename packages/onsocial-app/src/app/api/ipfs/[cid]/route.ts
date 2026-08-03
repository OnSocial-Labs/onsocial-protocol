import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import { isLikelyIpfsCid } from '@/features/scarces/drop-writing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CDN_BASE =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'https://cdn.onsocial.id/ipfs'
    : 'https://cdn.testnet.onsocial.id/ipfs';

/**
 * Same-origin IPFS proxy for Writing manifesto / chapter bodies.
 * Avoids browser CORS failures when fetching Markdown from the CDN.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ cid: string }> }
) {
  const { cid: raw } = await context.params;
  const cid = decodeURIComponent(raw ?? '')
    .trim()
    .replace(/^ipfs:\/\//, '');
  const root = cid.split('/')[0] ?? '';
  if (!root || !isLikelyIpfsCid(root)) {
    return NextResponse.json({ error: 'Invalid CID' }, { status: 400 });
  }

  const upstream = await fetch(`${CDN_BASE}/${cid}`, {
    headers: { Accept: '*/*' },
    next: { revalidate: 86_400 },
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: 'Content not found' },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const contentType =
    upstream.headers.get('content-type') || 'application/octet-stream';
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
