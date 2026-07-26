/**
 * Shared text-card PNG builder for mint, lazy-list, and preview.
 * One code path: resolve avatar → SVG → Resvg PNG (fontBuffers).
 */

import {
  generateTextCardSvg,
  resolveTheme,
  isBackgroundKey,
  isFontKey,
  isMarkColor,
  isMarkShape,
  isTitleAlign,
  isCardFormat,
  isCardFormatPalette,
  moodForCardFormat,
  CARD_FORMAT_REGISTRY,
  type CardFormat,
  type MarkColor,
  type MarkShape,
  type TitleAlign,
} from '@onsocial/text-card';
import { ComposeError, fetchImageAsDataUri, gatewayUrl } from './shared.js';
import {
  getProfileName,
  resolveCreatorAvatarDataUri,
} from './profileLookup.js';
import { rasterizeTextCard } from './card-raster.js';

export interface TextCardCreatorInput {
  accountId: string;
  displayName?: string;
  avatar?: string;
}

export interface BuildTextCardPngRequest {
  title: string;
  description?: string;
  /** Defaults to caller when omitted. */
  creator?: TextCardCreatorInput;
  cardBg?: string;
  cardFont?: string;
  cardMarkColor?: string;
  cardMarkShape?: string;
  cardTitleAlign?: string;
  cardFormat?: string;
  cardPalette?: string;
  cardPhotoCid?: string;
  /** Provenance post id when listing from a post. */
  postId?: string;
  /** Override issuedAt (ms). Default Date.now(). */
  issuedAt?: number;
  /**
   * Extra receipt guards used by QuickMint (photo + 60-char title when
   * mood is receipt-* even without cardFormat).
   */
  enforceLegacyReceiptGuards?: boolean;
}

export interface TextCardThemeExtra {
  bg: string;
  font: string;
  format?: CardFormat;
  palette?: string;
  markColor?: string;
  markShape?: string;
  titleAlign?: string;
  photoCid?: string;
}

export interface BuildTextCardPngResult {
  png: Buffer;
  /** Resolved theme keys for `extra.theme` persistence. */
  themeExtra: TextCardThemeExtra;
}

/**
 * Build the permanent (or preview-identical) text-card PNG.
 * Throws ComposeError on invalid theme keys or unusable avatar.
 */
export async function buildTextCardPng(
  fallbackAccountId: string,
  req: BuildTextCardPngRequest
): Promise<BuildTextCardPngResult> {
  let creator: TextCardCreatorInput = req.creator ?? {
    accountId: fallbackAccountId,
  };
  if (!creator.displayName) {
    const profileName = await getProfileName(creator.accountId);
    if (profileName) {
      creator = { ...creator, displayName: profileName };
    }
  }

  const avatarDataUri = await resolveCreatorAvatarDataUri(
    creator.accountId,
    creator.avatar
  );
  if (avatarDataUri) {
    creator = { ...creator, avatar: avatarDataUri };
  } else {
    creator = {
      accountId: creator.accountId,
      ...(creator.displayName ? { displayName: creator.displayName } : {}),
    };
  }

  let cardFormat: CardFormat | undefined;
  let resolvedCardBg = req.cardBg;
  if (req.cardFormat != null) {
    if (!isCardFormat(req.cardFormat)) {
      throw new ComposeError(400, `Unknown cardFormat: ${req.cardFormat}`);
    }
    cardFormat = req.cardFormat;
    const requestedPalette = req.cardPalette;
    if (
      requestedPalette != null &&
      !isCardFormatPalette(cardFormat, requestedPalette)
    ) {
      throw new ComposeError(
        400,
        `Unsupported ${requestedPalette} finish for ${cardFormat} cards.`
      );
    }
    const spec = CARD_FORMAT_REGISTRY[cardFormat];
    if (req.title.length > spec.maxCharacters) {
      throw new ComposeError(
        400,
        `${spec.label} cards support up to ${spec.maxCharacters} characters (got ${req.title.length}).`
      );
    }
    if (spec.requiresPhoto && !req.cardPhotoCid) {
      throw new ComposeError(
        400,
        `${spec.label} cards require cardPhotoCid (proof photo).`
      );
    }
    resolvedCardBg = moodForCardFormat(cardFormat, requestedPalette);
  }

  if (resolvedCardBg && !isBackgroundKey(resolvedCardBg)) {
    throw new ComposeError(400, `Unknown cardBg: ${resolvedCardBg}`);
  }
  if (req.cardFont && !isFontKey(req.cardFont)) {
    throw new ComposeError(400, `Unknown cardFont: ${req.cardFont}`);
  }
  if (req.cardMarkColor && !isMarkColor(req.cardMarkColor)) {
    throw new ComposeError(400, `Unknown cardMarkColor: ${req.cardMarkColor}`);
  }
  if (req.cardMarkShape && !isMarkShape(req.cardMarkShape)) {
    throw new ComposeError(400, `Unknown cardMarkShape: ${req.cardMarkShape}`);
  }
  if (req.cardTitleAlign && !isTitleAlign(req.cardTitleAlign)) {
    throw new ComposeError(
      400,
      `Unknown cardTitleAlign: ${req.cardTitleAlign}`
    );
  }

  if (req.enforceLegacyReceiptGuards) {
    if (
      cardFormat === 'receipt' ||
      (typeof resolvedCardBg === 'string' &&
        resolvedCardBg.startsWith('receipt-'))
    ) {
      if (!req.cardPhotoCid) {
        throw new ComposeError(
          400,
          'Receipt mood requires cardPhotoCid (proof photo).'
        );
      }
      if (req.title.length > 60) {
        throw new ComposeError(
          400,
          `Receipt title exceeds 60 chars (got ${req.title.length}).`
        );
      }
    }
  }

  const theme = resolveTheme({ bg: resolvedCardBg, font: req.cardFont });
  const themeForCard: {
    bg?: string;
    font?: string;
    markColor?: MarkColor;
    markShape?: MarkShape;
    titleAlign?: TitleAlign;
  } = {
    bg: theme.bg,
    font: theme.font,
    ...(req.cardMarkColor && {
      markColor: req.cardMarkColor as MarkColor,
    }),
    ...(req.cardMarkShape && {
      markShape: req.cardMarkShape as MarkShape,
    }),
    ...(req.cardTitleAlign && {
      titleAlign: req.cardTitleAlign as TitleAlign,
    }),
  };

  const photoDataUri = req.cardPhotoCid
    ? await fetchImageAsDataUri(gatewayUrl(req.cardPhotoCid))
    : undefined;

  const svg = generateTextCardSvg({
    title: req.title,
    description: req.description,
    creator,
    ...(cardFormat ? { format: cardFormat } : {}),
    theme: themeForCard,
    ...(photoDataUri ? { photo: photoDataUri } : {}),
    provenance: {
      issuedAt: req.issuedAt ?? Date.now(),
      ...(req.postId ? { postId: req.postId } : {}),
    },
  });

  const png = rasterizeTextCard(svg);

  const themeExtra: TextCardThemeExtra = {
    bg: theme.bg,
    font: theme.font,
    ...(cardFormat && { format: cardFormat }),
    ...(cardFormat && {
      palette:
        req.cardPalette ?? CARD_FORMAT_REGISTRY[cardFormat].defaultPalette,
    }),
    ...(req.cardMarkColor && { markColor: req.cardMarkColor }),
    ...(req.cardMarkShape && { markShape: req.cardMarkShape }),
    ...(req.cardTitleAlign && { titleAlign: req.cardTitleAlign }),
    ...(req.cardPhotoCid && { photoCid: req.cardPhotoCid }),
  };

  return { png, themeExtra };
}
