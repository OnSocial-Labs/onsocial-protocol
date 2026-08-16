import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export type BlockCheckResult =
  | { ok: true; blocked: boolean }
  /** Hasura configured but unreachable — callers should fail closed. */
  | { ok: false; unavailable: true };

/**
 * True when either account has a live `blocks_current` edge against the other.
 * - No admin secret (local/dev memory): treated as not blocked.
 * - Hasura configured but error: `unavailable` so send can fail closed.
 */
export async function checkBlockEitherWay(
  a: string,
  b: string
): Promise<BlockCheckResult> {
  const viewer = normalizeAccountId(a);
  const target = normalizeAccountId(b);
  if (!viewer || !target || viewer === target) {
    return { ok: true, blocked: false };
  }
  if (!config.hasuraAdminSecret) {
    return { ok: true, blocked: false };
  }

  try {
    const response = await fetch(config.hasuraUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': config.hasuraAdminSecret,
      },
      body: JSON.stringify({
        query: `query BlockEitherWay($viewer: String!, $target: String!) {
          outgoing: blocksCurrent(
            where: {
              accountId: {_eq: $viewer},
              targetAccount: {_eq: $target}
            },
            limit: 1
          ) { accountId }
          incoming: blocksCurrent(
            where: {
              accountId: {_eq: $target},
              targetAccount: {_eq: $viewer}
            },
            limit: 1
          ) { accountId }
        }`,
        variables: { viewer, target },
      }),
    });
    if (!response.ok) {
      logger.warn(
        { status: response.status },
        'checkBlockEitherWay Hasura HTTP error; unavailable'
      );
      return { ok: false, unavailable: true };
    }
    const json = (await response.json()) as {
      data?: {
        outgoing?: Array<{ accountId: string }>;
        incoming?: Array<{ accountId: string }>;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length || !json.data) {
      logger.warn(
        { error: json.errors?.[0]?.message },
        'checkBlockEitherWay Hasura GraphQL error; unavailable'
      );
      return { ok: false, unavailable: true };
    }
    const blocked =
      (json.data.outgoing?.length ?? 0) > 0 ||
      (json.data.incoming?.length ?? 0) > 0;
    return { ok: true, blocked };
  } catch (error) {
    logger.warn({ error }, 'checkBlockEitherWay failed; unavailable');
    return { ok: false, unavailable: true };
  }
}

/** @deprecated Prefer {@link checkBlockEitherWay}. */
export async function hasBlockEitherWay(
  a: string,
  b: string
): Promise<boolean> {
  const result = await checkBlockEitherWay(a, b);
  if (!result.ok) return true; // fail closed for boolean callers
  return result.blocked;
}
