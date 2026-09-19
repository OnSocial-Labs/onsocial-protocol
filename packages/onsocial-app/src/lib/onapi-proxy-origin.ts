/** True when the browser Origin is this app, not another site using our proxy. */
export function isOnApiSameOriginRequest(input: {
  origin: string | null;
  nextOrigin: string;
  host: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  protocol: string;
}): boolean {
  const origin = input.origin?.trim();
  if (!origin) return true;
  if (origin === input.nextOrigin) return true;

  const host = (input.forwardedHost ?? input.host)
    ?.split(',')[0]
    ?.trim();
  if (!host) return false;

  const proto = (
    input.forwardedProto?.split(',')[0]?.trim() ||
    input.protocol.replace(/:$/, '') ||
    'http'
  ).replace(/:$/, '');

  return origin === `${proto}://${host}`;
}
