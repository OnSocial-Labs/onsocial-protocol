export function communityDappSnippet(input: {
  appId: string;
  osOrigin: string;
  network: 'testnet' | 'mainnet';
}): string {
  const appId = input.appId.trim().toLowerCase();
  const osOrigin = input.osOrigin.replace(/\/$/, '');
  return `import { OnSocial } from "@onsocial/sdk";

const os = new OnSocial({ network: "${input.network}" });

// First visit: keypair here, then Continue with OnSocial grants
// apps/${appId}/. Later visits restore the JWT from a stored refresh token.
const session = await os.auth.completeAppHandoff({
  osOrigin: "${osOrigin}",
  appId: "${appId}",
});

await os.social.set({
  [\`apps/${appId}/item/\${Date.now().toString(36)}\`]: { hello: true },
});

const rows = await os.query.raw.byAppId("${appId}", {
  accountId: session.accountId,
  limit: 10,
});

// First-party social is the same graph:
// await os.posts.create({ text: "Shipped from ${appId}", access: "public" });
`;
}

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function communityDappContinueUrl(
  osOrigin: string,
  appId: string
): string {
  const origin = osOrigin.replace(/\/$/, '');
  const id = appId.trim().toLowerCase();
  if (!APP_ID_RE.test(id)) {
    throw new Error('appId is invalid');
  }
  return `${origin}/handoff?app=${encodeURIComponent(id)}`;
}
