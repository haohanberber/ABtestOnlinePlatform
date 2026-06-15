const MASK_64 = (1n << 64n) - 1n;
const MASK_128 = (1n << 128n) - 1n;
const C1 = 0x87c37b91114253d5n;
const C2 = 0x4cf5ad432745937fn;

function toUint64(value) {
  return value & MASK_64;
}

function mul64(a, b) {
  return toUint64(a * b);
}

function add64(a, b) {
  return toUint64(a + b);
}

function rotl64(value, bits) {
  const shift = BigInt(bits);
  return toUint64((value << shift) | (value >> (64n - shift)));
}

function fmix64(value) {
  let x = value;
  x ^= x >> 33n;
  x = mul64(x, 0xff51afd7ed558ccdn);
  x ^= x >> 33n;
  x = mul64(x, 0xc4ceb9fe1a85ec53n);
  x ^= x >> 33n;
  return x;
}

function readBlock64LE(bytes, start) {
  let out = 0n;
  for (let i = 0; i < 8; i += 1) {
    out |= BigInt(bytes[start + i]) << BigInt(i * 8);
  }
  return out;
}

function x64MurmurHash128Unsigned(input, seed = 233) {
  const bytes = new TextEncoder().encode(String(input));
  const totalLength = bytes.length;
  const blockCount = Math.floor(totalLength / 16);

  let h1 = BigInt(seed >>> 0);
  let h2 = BigInt(seed >>> 0);

  for (let i = 0; i < blockCount; i += 1) {
    const offset = i * 16;
    let k1 = readBlock64LE(bytes, offset);
    let k2 = readBlock64LE(bytes, offset + 8);

    k1 = mul64(k1, C1);
    k1 = rotl64(k1, 31);
    k1 = mul64(k1, C2);
    h1 ^= k1;

    h1 = rotl64(h1, 27);
    h1 = add64(h1, h2);
    h1 = add64(mul64(h1, 5n), 0x52dce729n);

    k2 = mul64(k2, C2);
    k2 = rotl64(k2, 33);
    k2 = mul64(k2, C1);
    h2 ^= k2;

    h2 = rotl64(h2, 31);
    h2 = add64(h2, h1);
    h2 = add64(mul64(h2, 5n), 0x38495ab5n);
  }

  let k1 = 0n;
  let k2 = 0n;
  const tailOffset = blockCount * 16;
  const tailLength = totalLength & 15;

  if (tailLength >= 15) k2 ^= BigInt(bytes[tailOffset + 14]) << 48n;
  if (tailLength >= 14) k2 ^= BigInt(bytes[tailOffset + 13]) << 40n;
  if (tailLength >= 13) k2 ^= BigInt(bytes[tailOffset + 12]) << 32n;
  if (tailLength >= 12) k2 ^= BigInt(bytes[tailOffset + 11]) << 24n;
  if (tailLength >= 11) k2 ^= BigInt(bytes[tailOffset + 10]) << 16n;
  if (tailLength >= 10) k2 ^= BigInt(bytes[tailOffset + 9]) << 8n;
  if (tailLength >= 9) {
    k2 ^= BigInt(bytes[tailOffset + 8]);
    k2 = mul64(k2, C2);
    k2 = rotl64(k2, 33);
    k2 = mul64(k2, C1);
    h2 ^= k2;
  }

  if (tailLength >= 8) k1 ^= BigInt(bytes[tailOffset + 7]) << 56n;
  if (tailLength >= 7) k1 ^= BigInt(bytes[tailOffset + 6]) << 48n;
  if (tailLength >= 6) k1 ^= BigInt(bytes[tailOffset + 5]) << 40n;
  if (tailLength >= 5) k1 ^= BigInt(bytes[tailOffset + 4]) << 32n;
  if (tailLength >= 4) k1 ^= BigInt(bytes[tailOffset + 3]) << 24n;
  if (tailLength >= 3) k1 ^= BigInt(bytes[tailOffset + 2]) << 16n;
  if (tailLength >= 2) k1 ^= BigInt(bytes[tailOffset + 1]) << 8n;
  if (tailLength >= 1) {
    k1 ^= BigInt(bytes[tailOffset]);
    k1 = mul64(k1, C1);
    k1 = rotl64(k1, 31);
    k1 = mul64(k1, C2);
    h1 ^= k1;
  }

  const len = BigInt(totalLength);
  h1 ^= len;
  h2 ^= len;
  h1 = add64(h1, h2);
  h2 = add64(h2, h1);
  h1 = fmix64(h1);
  h2 = fmix64(h2);
  h1 = add64(h1, h2);
  h2 = add64(h2, h1);

  return ((h2 << 64n) | h1) & MASK_128;
}

export function mmh3Hash128Signed(input, seed = 233) {
  const unsigned = x64MurmurHash128Unsigned(input, seed);
  if (unsigned >= (1n << 127n)) {
    return unsigned - (1n << 128n);
  }
  return unsigned;
}
