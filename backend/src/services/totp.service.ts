/**
 * M4.7 — TOTP service (fallback / step-up factor)
 * Uses otplib v13 for TOTP secret generation and code verification.
 * Secret is stored on the users row (totp_secret column, added in 00006).
 * totp_enabled is flipped to true only after the first successful verify.
 *
 * otplib v13 API notes (verified against installed package):
 *   - generate({ secret }) returns a Promise<string>
 *   - verify(token, { secret }) returns a Promise<{ valid: boolean, ... }>
 *   - generateURI uses { label, issuer, secret, type } — NOT account/accountName
 *   - NobleCryptoPlugin + ScureBase32Plugin must be passed to the TOTP constructor
 */
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin, generateSecret, generateURI } from 'otplib';
import pool from '../db/pool';

const APP_NAME = 'TrustLine';

// Singleton TOTP instance with the required crypto + base32 plugins
const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

export interface TotpSetupPayload {
  /** base32 secret — shown to user for manual entry */
  secret: string;
  /** otpauth:// URI suitable for QR-code encoding */
  otpauthUrl: string;
}

// ── generateSecretForUser ─────────────────────────────────────────────────
export async function generateSecretForUser(
  userId: string
): Promise<TotpSetupPayload> {
  // 1. Look up the user's email (used as the account label in the auth app)
  const { rows } = await pool.query<{ email: string }>(
    'SELECT email FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw new Error('user not found');
  const { email } = rows[0];

  // 2. Generate a fresh TOTP secret
  const secret = generateSecret();

  // 3. Persist secret (not yet enabled — caller must call verifyCode next)
  await pool.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2',
    [secret, userId]
  );

  // 4. Build the provisioning URI for QR-code display
  //    otplib v13: use `label` (not `account` / `accountName`)
  const otpauthUrl = generateURI({
    label: email,
    issuer: APP_NAME,
    secret,
    // type is implicit: TOTP is the default strategy
  });

  return { secret, otpauthUrl };
}

// ── verifyCode ────────────────────────────────────────────────────────────
export async function verifyCode(userId: string, code: string): Promise<void> {
  // 1. Load stored secret
  const { rows } = await pool.query<{ totp_secret: string | null }>(
    'SELECT totp_secret FROM users WHERE id = $1',
    [userId]
  );
  if (!rows[0]) throw new Error('user not found');
  const { totp_secret: secret } = rows[0];

  if (!secret) {
    throw new Error('TOTP not set up — call /totp/setup first');
  }

  // 2. Verify the submitted code
  //    otplib v13: verify(token, { secret }) returns Promise<{ valid: boolean }>
  const result = await totp.verify(code, { secret });
  if (!result.valid) {
    throw new Error('invalid TOTP code');
  }

  // 3. Mark TOTP as enabled (only on first successful verify)
  await pool.query(
    'UPDATE users SET totp_enabled = true WHERE id = $1',
    [userId]
  );
}
