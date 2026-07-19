/**
 * RFC 4226 / RFC 6238 TOTP service.
 *
 * This implementation deliberately uses only Node.js built-in `crypto` for
 * one-time-password generation and verification. QR rendering remains a
 * frontend concern; this service returns the standards-compliant otpauth URI.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import pool from '../db/pool';

const APP_NAME = 'TrustLine';
const TIME_STEP_SECONDS = 30;
const OTP_DIGITS = 6;
const DEFAULT_WINDOW = 1;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpSetupPayload {
  /** RFC 4648 Base32 secret shown to the user for authenticator enrollment. */
  secret: string;
  /** RFC 6238 otpauth URI, ready for frontend QR rendering. */
  otpauthUrl: string;
}

/**
 * Decode RFC 4648 Base32 without a third-party dependency.
 *
 * Authenticator apps commonly present unpadded Base32 secrets. We accept both
 * padded and unpadded RFC 4648 input, normalize case, and reject characters
 * outside the Base32 alphabet rather than silently changing the secret.
 */
export function decodeBase32(secret: string): Buffer {
  const normalized = secret.replace(/[\s-]/g, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+={0,6}$/.test(normalized)) {
    throw new Error('invalid Base32 secret');
  }

  const paddingIndex = normalized.indexOf('=');
  const encoded = paddingIndex === -1 ? normalized : normalized.slice(0, paddingIndex);
  if (paddingIndex !== -1 && /[^=]/.test(normalized.slice(paddingIndex))) {
    throw new Error('invalid Base32 padding');
  }

  // RFC 4648 permits unpadded Base32, but when padding is supplied it must
  // complete an eight-character quantum. The encoded data may end after 0, 2,
  // 4, 5, or 7 symbols; the corresponding pad lengths are fixed.
  const remainder = encoded.length % 8;
  if (paddingIndex === -1) {
    if (![0, 2, 4, 5, 7].includes(remainder)) {
      throw new Error('invalid Base32 length');
    }
  } else {
    const paddingLength = normalized.length - paddingIndex;
    const expectedPadding = new Map([[2, 6], [4, 4], [5, 3], [7, 1]]);
    if (normalized.length % 8 !== 0 || expectedPadding.get(remainder) !== paddingLength) {
      throw new Error('invalid Base32 padding');
    }
  }

  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const character of encoded) {
    const value = BASE32_ALPHABET.indexOf(character);
    // The regular expression above makes this unreachable, but retaining the
    // guard keeps this decoder safe if its validation changes later.
    if (value === -1) throw new Error('invalid Base32 secret');

    buffer = (buffer << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/** Encode bytes as unpadded RFC 4648 Base32 for authenticator compatibility. */
function encodeBase32(bytes: Buffer): string {
  let buffer = 0;
  let bits = 0;
  let result = '';

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >>> bits) & 0x1f];
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  return result;
}

/** Generate 160 random bits, the conventional secret length for HMAC-SHA1. */
function generateBase32Secret(): string {
  return encodeBase32(randomBytes(20));
}

function counterBuffer(counter: bigint): Buffer {
  if (counter < 0n) throw new Error('HOTP counter must not be negative');
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(counter);
  return value;
}

/**
 * Generate an RFC 4226 HOTP value from an RFC 4648 Base32 secret.
 *
 * HMAC-SHA1 is used because RFC 4226 defines HOTP with SHA-1 and RFC 6238
 * permits it. SHA-1 is not used here as a general-purpose hash; it is the
 * interoperable PRF required by the default TOTP profile used by common apps.
 */
export function generateHOTP(secret: string, counter: bigint, digits = OTP_DIGITS): string {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new Error('HOTP digits must be an integer between 6 and 10');
  }

  const hmac = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer(counter))
    .digest();

  // RFC 4226 dynamic truncation uses the low nibble of the final HMAC byte as
  // an offset, then reads four bytes and clears the sign bit to obtain a
  // positive 31-bit integer.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode = (
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  ) >>> 0;

  // Modulo 1,000,000 yields the six decimal digits expected by the existing
  // UI and most authenticator apps; pad leading zeroes so the token is always
  // exactly six characters.
  return String(binaryCode % (10 ** digits)).padStart(digits, '0');
}

/**
 * Generate an RFC 6238 six-digit TOTP for a Unix timestamp in milliseconds.
 *
 * RFC 6238 turns HOTP's counter into floor(unixSeconds / 30). Thirty seconds
 * is the interoperable default used by Google Authenticator, Authy, Bitwarden,
 * 1Password, and Microsoft Authenticator.
 */
export function generateTOTP(secret: string, timestamp = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error('timestamp must be a non-negative finite millisecond value');
  }
  const counter = BigInt(Math.floor(timestamp / (TIME_STEP_SECONDS * 1000)));
  return generateHOTP(secret, counter, OTP_DIGITS);
}

/**
 * Verify a TOTP in a small configurable clock-drift window.
 *
 * The default ±1 window accepts the preceding, current, and next 30-second
 * step. Every candidate is compared with timingSafeEqual and the loop does not
 * return early, avoiding a token-prefix timing oracle while preserving a
 * practical tolerance for client clock drift.
 */
export function verifyTOTP(
  secret: string,
  token: string,
  window = DEFAULT_WINDOW,
  timestamp = Date.now()
): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  if (!Number.isInteger(window) || window < 0) {
    throw new Error('verification window must be a non-negative integer');
  }
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new Error('timestamp must be a non-negative finite millisecond value');
  }

  const currentCounter = BigInt(Math.floor(timestamp / (TIME_STEP_SECONDS * 1000)));
  const supplied = Buffer.from(token, 'utf8');
  let verified = false;

  for (let offset = -window; offset <= window; offset += 1) {
    const candidateCounter = currentCounter + BigInt(offset);
    if (candidateCounter < 0n) continue;
    const candidate = Buffer.from(generateHOTP(secret, candidateCounter), 'utf8');
    verified = timingSafeEqual(supplied, candidate) || verified;
  }

  return verified;
}

/** Build a standard RFC 6238 provisioning URI for QR-code rendering. */
function buildOtpAuthUri(email: string, secret: string): string {
  const label = `${APP_NAME}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer: APP_NAME,
    algorithm: 'SHA1',
    digits: String(OTP_DIGITS),
    period: String(TIME_STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

// ── generateSecretForUser ─────────────────────────────────────────────────
export async function generateSecretForUser(userId: string): Promise<TotpSetupPayload> {
  const { rows } = await pool.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw new Error('user not found');

  const secret = generateBase32Secret();
  await pool.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2',
    [secret, userId]
  );

  return { secret, otpauthUrl: buildOtpAuthUri(rows[0].email, secret) };
}

// ── verifyCode ────────────────────────────────────────────────────────────
export async function verifyCode(userId: string, code: string): Promise<void> {
  const { rows } = await pool.query<{ totp_secret: string | null }>(
    'SELECT totp_secret FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw new Error('user not found');
  if (!rows[0].totp_secret) throw new Error('TOTP not set up — call /totp/setup first');

  if (!verifyTOTP(rows[0].totp_secret, code)) {
    throw new Error('invalid TOTP code');
  }

  await pool.query(
    'UPDATE users SET totp_enabled = true WHERE id = $1',
    [userId]
  );
}
