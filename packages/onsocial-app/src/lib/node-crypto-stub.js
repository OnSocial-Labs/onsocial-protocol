/** Browser stub — real `node:crypto` is server-only (SDK webhooks). */
export function createHmac() {
  throw new Error('node:crypto is not available in the browser');
}
