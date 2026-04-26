// ---------------------------------------------------------------------------
// NEAR amount — branded yocto string with safe arithmetic.
//
// On-chain NEAR amounts are 24-decimal fixed-point integers (yoctoNEAR).
// JavaScript `number` cannot represent them safely. We use a branded `string`
// (the yocto integer as decimal) backed by `bigint` math.
//
//   import { NEAR, near } from '@onsocial/sdk';
//
//   NEAR('0.1')                  // "100000000000000000000000"
//   NEAR.fromYocto('123')        // "123"
//   near.add(a, b)               // sum, NearAmount
//   near.gte(a, b)               // boolean
//   near.toHuman('1500000…')     // "0.0000000000015"
//
// Use a NearAmount anywhere a yocto string is expected — it serializes
// transparently as a string in JSON.
// ---------------------------------------------------------------------------

declare const _nearAmountBrand: unique symbol;

/** Branded yocto string. Construct via `NEAR(...)` or `NEAR.fromYocto(...)`. */
export type NearAmount = string & { readonly [_nearAmountBrand]: true };

const YOCTO_PER_NEAR = 10n ** 24n;

function isDigits(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

function parseNearStringToYocto(input: string): bigint {
  const trimmed = input.trim();
  if (trimmed === '') throw new Error(`Invalid NEAR amount: ""`);

  if (trimmed.startsWith('-')) {
    throw new Error(`NEAR amounts cannot be negative: "${input}"`);
  }

  const [whole, fracRaw = ''] = trimmed.split('.');
  if (!isDigits(whole)) throw new Error(`Invalid NEAR amount: "${input}"`);
  if (fracRaw && !isDigits(fracRaw)) {
    throw new Error(`Invalid NEAR amount: "${input}"`);
  }
  if (fracRaw.length > 24) {
    throw new Error(
      `NEAR amount has more than 24 fractional digits: "${input}"`
    );
  }

  const fracPadded = (fracRaw + '0'.repeat(24)).slice(0, 24);
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(fracPadded || '0');
}

function brand(yocto: bigint): NearAmount {
  if (yocto < 0n) throw new Error('NEAR amounts cannot be negative');
  return yocto.toString() as NearAmount;
}

/** Parse a human-readable NEAR amount to a NearAmount (yocto string). */
function near(value: string | number | bigint | NearAmount): NearAmount {
  if (typeof value === 'bigint') return brand(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NEAR amount must be finite');
    return near(value.toString());
  }
  return brand(parseNearStringToYocto(value));
}

/** Construct from an already-yocto-denominated value. */
near.fromYocto = function fromYocto(yocto: string | bigint): NearAmount {
  const big = typeof yocto === 'bigint' ? yocto : BigInt(yocto);
  return brand(big);
};

/** Zero amount. */
near.zero = brand(0n);

export const NEAR = near as typeof near & {
  fromYocto: typeof near.fromYocto;
  zero: NearAmount;
};

// ── Arithmetic helpers ─────────────────────────────────────────────────────

function asBig(a: NearAmount | string): bigint {
  return BigInt(a);
}

export const nearMath = {
  add(a: NearAmount, b: NearAmount): NearAmount {
    return brand(asBig(a) + asBig(b));
  },
  sub(a: NearAmount, b: NearAmount): NearAmount {
    const r = asBig(a) - asBig(b);
    if (r < 0n) throw new Error('NEAR subtraction would be negative');
    return brand(r);
  },
  mul(a: NearAmount, factor: bigint | number): NearAmount {
    const f = typeof factor === 'number' ? BigInt(factor) : factor;
    return brand(asBig(a) * f);
  },
  eq(a: NearAmount, b: NearAmount): boolean {
    return asBig(a) === asBig(b);
  },
  gt(a: NearAmount, b: NearAmount): boolean {
    return asBig(a) > asBig(b);
  },
  gte(a: NearAmount, b: NearAmount): boolean {
    return asBig(a) >= asBig(b);
  },
  lt(a: NearAmount, b: NearAmount): boolean {
    return asBig(a) < asBig(b);
  },
  lte(a: NearAmount, b: NearAmount): boolean {
    return asBig(a) <= asBig(b);
  },
  /** Format yocto → human-readable NEAR (no trailing zeros, max 24 frac digits). */
  toHuman(a: NearAmount | string): string {
    const big = asBig(a as NearAmount);
    const whole = big / YOCTO_PER_NEAR;
    const frac = big % YOCTO_PER_NEAR;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(24, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  },
};
