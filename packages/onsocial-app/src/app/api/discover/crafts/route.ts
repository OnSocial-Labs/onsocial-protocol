import { NextResponse } from 'next/server';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { DISCOVER_CUSTOM_CRAFT_MIN_COUNT } from '@/lib/profile-craft-suggestions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Craft discover failed';
}

/** Popular About crafts for People Discover (seed + custom with counts). */
export async function GET() {
  try {
    const os = createServerOnSocialClient();
    const crafts = await os.query.profiles.craftCounts({
      limit: 48,
      minCount: 1,
    });
    return NextResponse.json(
      {
        crafts: crafts.map((row) => ({
          tag: row.tag,
          profileCount: row.profileCount,
        })),
        minCustomCount: DISCOVER_CUSTOM_CRAFT_MIN_COUNT,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    const detail = getErrorMessage(error);
    const missingKey = detail.includes('ONSOCIAL_API_KEY');
    // Soft-fail when the counts view is not tracked yet — seed crafts still work.
    if (!missingKey) {
      return NextResponse.json(
        { crafts: [], minCustomCount: DISCOVER_CUSTOM_CRAFT_MIN_COUNT },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(
      {
        error: 'Server API key is not configured',
        detail,
        crafts: [],
      },
      { status: 503 }
    );
  }
}
