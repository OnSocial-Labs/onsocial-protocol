import { NextResponse } from 'next/server';
import { ACTIVE_BACKEND_URL } from '@/lib/portal-config';

const GOVERNANCE_BACKEND_URL = process.env.BACKEND_URL ?? ACTIVE_BACKEND_URL;

export async function GET() {
  try {
    const res = await fetch(
      `${GOVERNANCE_BACKEND_URL}/v1/partners/governance-feed`
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Backend unreachable' },
      { status: 502 }
    );
  }
}
