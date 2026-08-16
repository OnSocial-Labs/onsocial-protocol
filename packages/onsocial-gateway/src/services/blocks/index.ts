import { config } from '../../config/index.js';
import { logger } from '../../logger.js';

function normalizeAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

/**
 * True when either account has a live `blocks_current` edge against the other.
 * Fail-open when Hasura is unavailable so mailbox stays usable in local/dev.
 */
export async function hasBlockEitherWay(
  a: string,
  b: string
): Promise<boolean> {
  const viewer = normalizeAccountId(a);
  const target = normalizeAccountId(b);
  if (!viewer || !target || viewer === target) return false;
  if (!config.hasuraAdminSecret) return false;

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
    const json = (await response.json()) as {
      data?: {
        outgoing?: Array<{ accountId: string }>;
        incoming?: Array<{ accountId: string }>;
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      logger.warn(
        { error: json.errors[0]?.message },
        'hasBlockEitherWay Hasura error; failing open'
      );
      return false;
    }
    return (
      (json.data?.outgoing?.length ?? 0) > 0 ||
      (json.data?.incoming?.length ?? 0) > 0
    );
  } catch (error) {
    logger.warn({ error }, 'hasBlockEitherWay failed; failing open');
    return false;
  }
}
