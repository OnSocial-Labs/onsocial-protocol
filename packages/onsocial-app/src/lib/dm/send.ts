import type { OnSocial } from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { Session } from '@onsocial/sdk/advanced';
import { encodeBase64 } from 'tweetnacl-util';
import { ensureAppGatewayAuth } from '@/lib/app-gateway-auth';
import { openDmText, sealDmBytes, sealDmText } from '@/lib/dm/crypto';
import { ensureDmKeys, loadDmKeyPair } from '@/lib/dm/keys';
import { fetchDmPublicKey, publishDmPublicKey } from '@/lib/dm/pubkey';

export type SendDmResult =
  | {
      ok: true;
      threadId: string;
      messageId: string;
      recoveryCode: string | null;
    }
  | { ok: false; error: string };

async function withDmAuth(opts: {
  client: OnSocial;
  accountId: string;
  wallet: NearWalletBase;
  session: Session;
}): Promise<void> {
  const token = await ensureAppGatewayAuth({
    accountId: opts.accountId,
    wallet: opts.wallet,
    session: opts.session,
    allowWalletFallback: true,
  });
  opts.client.auth.setToken(token);
}

export async function sendEncryptedDm(opts: {
  client: OnSocial;
  accountId: string;
  wallet: NearWalletBase;
  session: Session;
  recipientAccountId: string;
  text: string;
  mediaFile?: File | null;
}): Promise<SendDmResult> {
  const recipient = opts.recipientAccountId.trim().toLowerCase();
  if (!opts.text.trim() && !opts.mediaFile) {
    return { ok: false, error: 'Write a message or add media.' };
  }

  let keys;
  try {
    keys = await ensureDmKeys(opts.accountId);
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unlock messages on this device first.',
    };
  }

  await publishDmPublicKey(opts.client, keys.publicKeyEncoded);

  const recipientPubkey = await fetchDmPublicKey(opts.client, recipient);
  if (!recipientPubkey) {
    return {
      ok: false,
      error:
        'They have not enabled private messages yet. Ask them to open Messages once.',
    };
  }

  const sealed = sealDmText({
    text: opts.text.trim() || (opts.mediaFile ? '📷' : ''),
    recipientPublicKey: recipientPubkey,
    senderKeyPair: keys.keyPair,
  });

  let media:
    | Array<{ cid: string; mime: string; size: number; nonce: string }>
    | undefined;
  if (opts.mediaFile) {
    const bytes = new Uint8Array(await opts.mediaFile.arrayBuffer());
    const sealedMedia = sealDmBytes({
      bytes,
      recipientPublicKey: recipientPubkey,
      senderKeyPair: keys.keyPair,
    });
    const cipherCopy = Uint8Array.from(sealedMedia.ciphertext);
    const file = new File([cipherCopy], `dm-${Date.now()}.bin`, {
      type: 'application/octet-stream',
    });
    const uploaded = await opts.client.storage.upload(file);
    media = [
      {
        cid: uploaded.cid,
        mime: opts.mediaFile.type || 'application/octet-stream',
        size: bytes.length,
        nonce: encodeBase64(sealedMedia.nonce),
      },
    ];
  }

  await withDmAuth(opts);
  const message = await opts.client.dm.send({
    recipientAccountId: recipient,
    ciphertext: sealed.ciphertext,
    nonce: sealed.nonce,
    senderCiphertext: sealed.senderCiphertext,
    senderNonce: sealed.senderNonce,
    senderPubkey: sealed.senderPubkey,
    media: media ?? null,
  });

  return {
    ok: true,
    threadId: message.threadId,
    messageId: message.id,
    recoveryCode: keys.recoveryCode,
  };
}

export async function decryptDmMessage(opts: {
  accountId: string;
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  senderAccountId: string;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
}): Promise<string> {
  const keyPair = loadDmKeyPair(opts.accountId);
  if (!keyPair) {
    throw new Error('Unlock messages on this device to read.');
  }
  const viewerIsSender =
    opts.senderAccountId.trim().toLowerCase() ===
    opts.accountId.trim().toLowerCase();
  const body = openDmText({
    ciphertext: opts.ciphertext,
    nonce: opts.nonce,
    senderPubkey: opts.senderPubkey,
    recipientSecretKey: keyPair.secretKey,
    senderCiphertext: opts.senderCiphertext,
    senderNonce: opts.senderNonce,
    viewerIsSender,
  });
  return body.text;
}
