import type { OnSocial } from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { Session } from '@onsocial/sdk/advanced';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { ensureAppGatewayAuth } from '@/lib/app-gateway-auth';
import {
  decodeDmPublicKey,
  openDmBytes,
  openDmText,
  sealDmBytes,
  sealDmText,
} from '@/lib/dm/crypto';
import { ensureDmKeys, loadDmKeyPair } from '@/lib/dm/keys';
import {
  lookupDmKeyBackup,
  lookupDmPublicKey,
  reconcileAndPublishDmIdentity,
} from '@/lib/dm/pubkey';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import { isBlockEitherWay } from '@/lib/viewer-mute-block-filter';

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

/** Dual-seal media into one Lighthouse blob (recipient + sender copies). */
async function sealAndUploadMedia(opts: {
  client: OnSocial;
  file: File;
  recipientPublicKey: Uint8Array;
  senderKeyPair: NonNullable<ReturnType<typeof loadDmKeyPair>>;
}): Promise<{
  cid: string;
  mime: string;
  size: number;
  nonce: string;
  senderNonce: string;
}> {
  const bytes = new Uint8Array(await opts.file.arrayBuffer());
  const forRecipient = sealDmBytes({
    bytes,
    recipientPublicKey: opts.recipientPublicKey,
    senderKeyPair: opts.senderKeyPair,
  });
  const forSender = sealDmBytes({
    bytes,
    recipientPublicKey: opts.senderKeyPair.publicKey,
    senderKeyPair: opts.senderKeyPair,
    ephemeral: forRecipient.ephemeral,
  });
  const envelope = new TextEncoder().encode(
    JSON.stringify({
      v: 2,
      recipient: encodeBase64(forRecipient.ciphertext),
      nonce: encodeBase64(forRecipient.nonce),
      sender: encodeBase64(forSender.ciphertext),
      senderNonce: encodeBase64(forSender.nonce),
      ephemeralPubkey: forRecipient.ephemeralPubkey,
    })
  );
  const uploaded = await opts.client.storage.upload(
    new File([envelope], `dm-media-${Date.now()}.json`, {
      type: 'application/json',
    })
  );
  return {
    cid: uploaded.cid,
    mime: opts.file.type || 'application/octet-stream',
    size: bytes.length,
    nonce: encodeBase64(forRecipient.nonce),
    senderNonce: encodeBase64(forSender.nonce),
  };
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
  if (isBlockEitherWay(recipient)) {
    return {
      ok: false,
      error: 'Messaging is unavailable while a block is in place.',
    };
  }

  let keys;
  try {
    const remote = await lookupDmKeyBackup(opts.client, opts.accountId);
    keys = await ensureDmKeys(opts.accountId, { remote });
    await reconcileAndPublishDmIdentity({
      client: opts.client,
      accountId: opts.accountId,
      publicKeyEncoded: keys.publicKeyEncoded,
      backup: keys.backup,
      created: keys.created,
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unlock messages on this device first.',
    };
  }

  const recipientLookup = await lookupDmPublicKey(opts.client, recipient);
  if (recipientLookup.status === 'unavailable') {
    return {
      ok: false,
      error: 'Could not look up their messaging key. Try again.',
    };
  }
  if (recipientLookup.status === 'absent') {
    return {
      ok: false,
      error:
        'They have not enabled private messages yet. Ask them to open Messages once.',
    };
  }
  const recipientPubkey = recipientLookup.value;

  const sealed = sealDmText({
    text: opts.text.trim() || (opts.mediaFile ? '' : ''),
    recipientPublicKey: recipientPubkey,
    senderKeyPair: keys.keyPair,
  });

  let media:
    | Array<{
        cid: string;
        mime: string;
        size: number;
        nonce: string;
        senderNonce?: string;
      }>
    | undefined;
  if (opts.mediaFile) {
    media = [
      await sealAndUploadMedia({
        client: opts.client,
        file: opts.mediaFile,
        recipientPublicKey: recipientPubkey,
        senderKeyPair: keys.keyPair,
      }),
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
    ephemeralPubkey: sealed.ephemeralPubkey,
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
  ephemeralPubkey?: string | null;
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
    ephemeralPubkey: opts.ephemeralPubkey,
    viewerIsSender,
  });
  return body.text;
}

export type DecryptedDmMedia = {
  objectUrl: string;
  mime: string;
};

/**
 * Fetch sealed media from CDN and open with the viewer's messaging key.
 * Supports dual-seal envelope (v1/v2) and legacy single-box ciphertext files.
 */
export async function decryptDmMedia(opts: {
  accountId: string;
  senderAccountId: string;
  senderPubkey: string;
  cid: string;
  mime: string;
  nonce?: string | null;
  senderNonce?: string | null;
  ephemeralPubkey?: string | null;
}): Promise<DecryptedDmMedia> {
  const keyPair = loadDmKeyPair(opts.accountId);
  if (!keyPair) {
    throw new Error('Unlock messages on this device to read.');
  }
  const url = resolveProfileMediaUrl(`ipfs://${opts.cid}`);
  if (!url) throw new Error('Invalid media reference');

  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load media');
  const raw = new Uint8Array(await response.arrayBuffer());

  const viewerIsSender =
    opts.senderAccountId.trim().toLowerCase() ===
    opts.accountId.trim().toLowerCase();

  let plain: Uint8Array;
  try {
    const asText = new TextDecoder().decode(raw);
    const envelope = JSON.parse(asText) as {
      v?: number;
      recipient?: string;
      nonce?: string;
      sender?: string;
      senderNonce?: string;
      ephemeralPubkey?: string;
    };
    if (
      (envelope?.v === 1 || envelope?.v === 2) &&
      typeof envelope.recipient === 'string' &&
      typeof envelope.nonce === 'string'
    ) {
      const sealerPubkey = decodeDmPublicKey(
        (typeof envelope.ephemeralPubkey === 'string' &&
        envelope.ephemeralPubkey.trim()
          ? envelope.ephemeralPubkey
          : null) ||
          (opts.ephemeralPubkey?.trim() ? opts.ephemeralPubkey : null) ||
          opts.senderPubkey
      );
      if (
        viewerIsSender &&
        typeof envelope.sender === 'string' &&
        typeof envelope.senderNonce === 'string'
      ) {
        plain = openDmBytes({
          ciphertext: decodeBase64(envelope.sender),
          nonce: decodeBase64(envelope.senderNonce),
          senderPubkey: sealerPubkey,
          recipientSecretKey: keyPair.secretKey,
        });
      } else {
        plain = openDmBytes({
          ciphertext: decodeBase64(envelope.recipient),
          nonce: decodeBase64(envelope.nonce),
          senderPubkey: sealerPubkey,
          recipientSecretKey: keyPair.secretKey,
        });
      }
    } else {
      throw new Error('not-envelope');
    }
  } catch {
    if (!opts.nonce) throw new Error('Failed to open media');
    const sealerPubkey = decodeDmPublicKey(
      opts.ephemeralPubkey?.trim() ? opts.ephemeralPubkey : opts.senderPubkey
    );
    plain = openDmBytes({
      ciphertext: raw,
      nonce: decodeBase64(opts.nonce),
      senderPubkey: sealerPubkey,
      recipientSecretKey: keyPair.secretKey,
    });
  }

  const copy = new Uint8Array(plain);
  const blob = new Blob([copy], { type: opts.mime });
  return { objectUrl: URL.createObjectURL(blob), mime: opts.mime };
}
