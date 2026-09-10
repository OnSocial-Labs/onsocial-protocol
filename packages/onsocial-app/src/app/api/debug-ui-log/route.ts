import { appendFileSync } from 'node:fs';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    appendFileSync(
      '/opt/cursor/logs/debug.log',
      `${JSON.stringify(payload)}\n`
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
