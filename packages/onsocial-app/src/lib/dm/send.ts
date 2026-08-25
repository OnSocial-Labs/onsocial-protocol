import type { OnSocial } from '@onsocial/sdk';
import { OnSocialError } from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { Session } from '@onsocial/sdk/advanced';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { ensureAppGatewayAuth } from '@/lib/app-gateway-auth';
import {
  decodeDmPublicKey,
  encodeDmPublicKey,
  generateDmKeyPair,
  openDmBytes,
  openDmText,
  sealDmBytes,
  sealDmText,
  type DmKeyPair,
} from '@/lib/dm/crypto';
import {
  DmKeysLockedError,
  DmKeysMismatchError,
  ensureDmKeys,
  loadDmKeyPair,
} from '@/lib/dm/keys';
import {
  lookupDmKeyBackup,
  lookupDmPublicKey,
  reconcileAndPublishDmIdentity,
} from '@/lib/dm/pubkey';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  isBlockEitherWay,
  isViewerMuting,
} from '@/lib/viewer-mute-block-filter';

export type SendDmResult =
  | {
      ok: true;
      threadId: string;
      messageId: string;
      recoveryCode: string | null;
    }
  | { ok: false; error: string; needsUnlock?: boolean };

const DECRYPT_FAIL_PLACEHOLDER = 'Unable to decrypt on this device.';

export function isDmDecryptFailureText(text: string | undefined): boolean {
  return !text || text === DECRYPT_FAIL_PLACEHOLDER;
}

function mapSendError(error: unknown): { error: string; needsUnlock?: boolean } {
  if (error instanceof DmKeysLockedError || error instanceof DmKeysMismatchError) {
    return { error: error.message, needsUnlock: true };
  }
  if (error instanceof OnSocialError) {
    if (error.code === 'MUTED') {
      return {
        error:
          error.message ||
          'Messaging isn’t available because of a mute.',
      };
    }
    if (error.code === 'BLOCKED') {
      return {
        error: 'Messaging is unavailable while a block is in place.',
      };
    }
    if (error.code === 'UNAVAILABLE') {
      return {
        error: 'Could not verify messaging permission. Try again.',
      };
    }
    return { error: error.message };
  }
  if (error instanceof Error) {
    const locked =
      /unlock|recovery code|messaging keys/i.test(error.message) &&
      !/look up|enabled private/i.test(error.message);
    return { error: error.message, needsUnlock: locked || undefined };
  }
  return { error: 'Unlock messages on this device first.', needsUnlock: true };
}

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
  senderKeyPair: DmKeyPair;
  ephemeral: DmKeyPair;
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
    ephemeral: opts.ephemeral,
  });
  const forSender = sealDmBytes({
    bytes,
    recipientPublicKey: opts.senderKeyPair.publicKey,
    senderKeyPair: opts.senderKeyPair,
    ephemeral: opts.ephemeral,
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
  replyToMessageId?: string | null;
}): Promise<SendDmResult> {
  const recipient = opts.recipientAccountId.trim().toLowerCase();
  if (!opts.text.trim() && !opts.mediaFile) {
    return { ok: false, error: 'Write a message or add media.' };
  }
  if (opts.text.length > 8_000) {
    return { ok: false, error: 'Message is too long.' };
  }
  if (opts.mediaFile && opts.mediaFile.size > 12 * 1024 * 1024) {
    return { ok: false, error: 'Media must be 12MB or smaller.' };
  }
  if (isBlockEitherWay(recipient)) {
    return {
      ok: false,
      error: 'Messaging is unavailable while a block is in place.',
    };
  }
  if (isViewerMuting(recipient)) {
    return {
      ok: false,
      error: 'You muted them. Unmute to send a message.',
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
    return { ok: false, ...mapSendError(error) };
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
  const sharedEphemeral = generateDmKeyPair();

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
        ephemeral: sharedEphemeral,
      }),
    ];
  }

  const sealed = sealDmText({
    text: opts.text.trim() || (opts.mediaFile ? '' : ''),
    recipientPublicKey: recipientPubkey,
    senderKeyPair: keys.keyPair,
    ephemeral: sharedEphemeral,
    mediaCids: media?.map((item) => item.cid) ?? null,
    replyToMessageId: opts.replyToMessageId,
  });

  try {
    await withDmAuth(opts);
    const message = await opts.client.dm.send({
      recipientAccountId: recipient,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderCiphertext: sealed.senderCiphertext,
      senderNonce: sealed.senderNonce,
      senderPubkey: sealed.senderPubkey,
      ephemeralPubkey: sealed.ephemeralPubkey,
      authTag: sealed.authTag,
      media: media ?? null,
    });

    return {
      ok: true,
      threadId: message.threadId,
      messageId: message.id,
      recoveryCode: keys.recoveryCode,
    };
  } catch (error) {
    return { ok: false, ...mapSendError(error) };
  }
}

export async function decryptDmMessage(opts: {
  client: OnSocial;
  accountId: string;
  ciphertext: string;
  nonce: string;
  senderPubkey: string;
  senderAccountId: string;
  senderCiphertext?: string | null;
  senderNonce?: string | null;
  ephemeralPubkey?: string | null;
  authTag?: string | null;
  mediaCids?: readonly string[] | null;
  /**
   * When set, skip profile lookup and require the claimed senderPubkey to match.
   * Pass from a per-thread cache after one successful lookup.
   */
  expectedSenderPublicKey?: Uint8Array | null;
}): Promise<{ text: string; replyToMessageId?: string }> {
  const keyPair = loadDmKeyPair(opts.accountId);
  if (!keyPair) {
    throw new Error('Unlock messages on this device to read.');
  }
  const viewerIsSender =
    opts.senderAccountId.trim().toLowerCase() ===
    opts.accountId.trim().toLowerCase();

  if (!viewerIsSender) {
    let profileKey = opts.expectedSenderPublicKey ?? null;
    if (!profileKey) {
      const lookup = await lookupDmPublicKey(
        opts.client,
        opts.senderAccountId
      );
      if (lookup.status === 'unavailable') {
        throw new Error('Could not verify sender messaging key.');
      }
      if (lookup.status === 'absent') {
        throw new Error('Sender has no published messaging key.');
      }
      profileKey = lookup.value;
    }
    if (encodeDmPublicKey(profileKey) !== opts.senderPubkey.trim()) {
      throw new Error('Sender key does not match their profile.');
    }
  }

  const body = openDmText({
    ciphertext: opts.ciphertext,
    nonce: opts.nonce,
    senderPubkey: opts.senderPubkey,
    recipientSecretKey: keyPair.secretKey,
    senderCiphertext: opts.senderCiphertext,
    senderNonce: opts.senderNonce,
    ephemeralPubkey: opts.ephemeralPubkey,
    authTag: opts.authTag,
    viewerIsSender,
    mediaCids: opts.mediaCids,
  });
  return body;
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
