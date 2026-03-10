// ---------------------------------------------------------------------------
// OnSocial banner — logo-only, 800×160, hosted on Lighthouse IPFS.
// Sourced from token contract icon (ft_metadata().icon on token.onsocial.near)
// ---------------------------------------------------------------------------

/** IPFS CID of the OnSocial banner PNG (800×160, logo-only on black). */
export const BANNER_CID =
  'bafkreicflvo4yqypyyl5gs57kqvxv7dbgvsz3fna56cgrza5ta7rqylm5i';

/** Full IPFS gateway URL for the banner. */
export const BANNER_URL = `https://gateway.lighthouse.storage/ipfs/${BANNER_CID}`;

/**
 * Link preview options that display the banner above the message text.
 * Uses Telegram's link preview instead of replyWithPhoto, so the image
 * is NOT recorded in the chat's shared media gallery.
 */
export const BANNER_PREVIEW = {
  url: BANNER_URL,
  prefer_large_media: true,
  show_above_text: true,
} as const;
