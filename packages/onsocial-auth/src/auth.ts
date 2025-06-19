import axios from 'axios';
import { signMessage } from './wallet';
import { saveToken } from './storage';

export async function getJWT({
  message,
  recipient,
  nonce,
  apiUrl,
}: {
  message: string;
  recipient: string;
  nonce: Uint8Array;
  apiUrl: string;
}) {
  const { signature, accountId, publicKey } = await signMessage({
    message,
    recipient,
    nonce,
  });
  const res = await axios.post(`${apiUrl}/auth/login`, {
    signature,
    accountId,
    publicKey,
    message,
    recipient,
    nonce,
  });
  await saveToken(res.data.token);
  return res.data.token;
}
