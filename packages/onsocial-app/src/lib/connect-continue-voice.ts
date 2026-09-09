/** Guest continue / gate copy — never Connect wallet. */
export const CONNECT_CONTINUE = 'Connect to continue.';

export function connectBefore(action: string): string {
  return `Connect before ${action}.`;
}
