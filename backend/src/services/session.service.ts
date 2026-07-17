/**
 * M4.5 — Session issuance service
 * Issues a short-lived JWT access token and a longer-lived refresh token.
 * Refresh tokens are stored hashed (SHA-256) in the refresh_tokens table
 * with a family_id for reuse detection (see M3.4 schema).
 */
import { randomBytes, createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import config from '../lib/config';

// Access token: 15 minutes
const ACCESS_TOKEN_TTL = '15m';
// Refresh token: 7 days
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 604800 s
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * 1000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// ── issueSession ───────────────────────────────────────────────────────────
export async function issueSession(userId: string): Promise<SessionTokens> {
  // 1. Sign access token (JWT)
  const accessToken = jwt.sign(
    { sub: userId },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  // 2. Generate raw refresh token + hash it for storage
  const rawRefreshToken = randomBytes(40).toString('hex');
  const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

  // 3. New family_id for this rotation chain
  const { rows: uuidRow } = await pool.query<{ id: string }>(
    'SELECT gen_random_uuid()::text AS id'
  );
  const familyId = uuidRow[0].id;

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  // 4. Persist hashed refresh token
  await pool.query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, family_id, revoked, expires_at)
     VALUES ($1, $2, $3, false, $4)`,
    [userId, tokenHash, familyId, expiresAt]
  );

  return { accessToken, refreshToken: rawRefreshToken };
}
