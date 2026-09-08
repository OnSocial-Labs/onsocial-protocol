export const DISCOVER_GUILDS_LOAD_MORE_ERROR = 'Could not load more guilds.';

export function discoverGuildsLoadMoreError(cause: unknown): string {
  return cause instanceof Error && cause.message.trim()
    ? cause.message
    : DISCOVER_GUILDS_LOAD_MORE_ERROR;
}
