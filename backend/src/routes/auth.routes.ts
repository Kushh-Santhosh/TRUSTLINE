import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  generateRegistrationOptionsForUser,
  verifyRegistration,
  generateLoginOptionsForUser,
  verifyLogin,
} from '../services/webauthn.service';
import { issueSession, rotateRefreshToken } from '../services/session.service';
import { generateSecretForUser, verifyCode } from '../services/totp.service';
import { scoreLoginRisk, recordStepUpAttempt } from '../services/risk.service';
import { requireAuth } from '../middleware/requireAuth';
import pool from '../db/pool';
import config from '../lib/config';
import logger from '../lib/logger';

// Short-lived pending token TTL (5 minutes) — bridges WebAuthn success → TOTP step-up
const STEP_UP_TTL = '5m';
const STEP_UP_PURPOSE = 'step_up' as const;

// ── Structured error logger ────────────────────────────────────────────────
function logAuthError(endpoint: string, err: unknown, ctx: Record<string, unknown> = {}): string {
  const isError  = err instanceof Error;
  const message  = isError ? err.message : String(err);
  const code     = (err && typeof err === 'object' && 'code' in err)
    ? String((err as Record<string, unknown>).code)
    : undefined;
  const isConnRefused = code === 'ECONNREFUSED' || message.includes('ECONNREFUSED');

  logger.error(
    {
      endpoint,
      errMessage: message,
      errCode:    code,
      errStack:   isError ? err.stack : undefined,
      ...(isConnRefused ? { hint: 'PostgreSQL is not reachable — run: docker compose up -d postgres redis' } : {}),
      ...ctx,
    },
    isConnRefused
      ? `[auth] ${endpoint}: database not reachable (ECONNREFUSED) — start PostgreSQL first`
      : `[auth] ${endpoint}: unexpected error`
  );

  // Return a user-safe message (include original for dev; redact in prod if needed)
  return isConnRefused ? `database not reachable — is PostgreSQL running?` : message;
}

const router = Router();

// ── POST /api/auth/register/options ───────────────────────────────────────
// Body: { email: string }
// Returns: PublicKeyCredentialCreationOptionsJSON
router.post(
  '/register/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };
    logger.info({ endpoint: 'register/options', email }, '[auth] register/options: incoming');

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      logger.info({ email }, '[auth] register/options: calling generateRegistrationOptionsForUser');
      const options = await generateRegistrationOptionsForUser(email.trim().toLowerCase());
      logger.info({ email, challengeLen: options.challenge.length }, '[auth] register/options: success');
      res.json(options);
    } catch (err) {
      const message = logAuthError('register/options', err, { email });
      res.status(500).json({ error: message });
    }
  }
);

// ── POST /api/auth/register/verify ────────────────────────────────────────
// Body: { email: string, response: RegistrationResponseJSON }
// Returns: { verified: true }
router.post(
  '/register/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as {
      email?: string;
      response?: unknown;
    };
    logger.info({ endpoint: 'register/verify', email }, '[auth] register/verify: incoming');

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response is required' });
      return;
    }

    try {
      logger.info({ email }, '[auth] register/verify: calling verifyRegistration');
      const { userId } = await verifyRegistration(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyRegistration>[1]
      );
      logger.info({ email }, '[auth] register/verify: success');
      res.json({ verified: true, userId });
    } catch (err) {
      const isError = err instanceof Error;
      const message = isError && err.message ? err.message : 'verification failed';
      logAuthError('register/verify', err, { email });
      const status = message.includes('no pending challenge') ? 400 : 422;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/options ──────────────────────────────────────────
// Body: { email: string }
// Returns: PublicKeyCredentialRequestOptionsJSON
router.post(
  '/login/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };
    logger.info({ endpoint: 'login/options', email }, '[auth] login/options: incoming');

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      logger.info({ email }, '[auth] login/options: calling generateLoginOptionsForUser');
      const options = await generateLoginOptionsForUser(email.trim().toLowerCase());
      logger.info({ email, challengeLen: options.challenge.length }, '[auth] login/options: success');
      res.json(options);
    } catch (err) {
      const raw = err instanceof Error && err.message ? err.message : 'internal error';
      const message = logAuthError('login/options', err, { email });
      const status = raw.includes('no credentials') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/verify ──────────────────────────────────────────
// Body: { email: string, response: AuthenticationResponseJSON }
// Low-risk  → 200 { accessToken, refreshToken }
// Medium/high risk → 200 { stepUpRequired: true, method: 'totp', pendingToken: string }
router.post(
  '/login/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as {
      email?: string;
      response?: unknown;
    };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response is required' });
      return;
    }

    const ip = req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;

    logger.info({ endpoint: 'login/verify', email }, '[auth] login/verify: incoming');

    try {
      logger.info({ email }, '[auth] login/verify: calling verifyLogin');
      const userId = await verifyLogin(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyLogin>[1]
      );
      logger.info({ email, userId }, '[auth] login/verify: passkey verified');

      // M7.3 — Score the login risk before deciding whether to issue tokens
      logger.info({ userId }, '[auth] login/verify: scoring risk');
      const { score } = await scoreLoginRisk(userId, ip, userAgent);
      logger.info({ userId, score }, '[auth] login/verify: risk score');

      if (score === 'medium' || score === 'high') {
        // Issue a short-lived pending token so the step-up endpoint
        // knows which user completed WebAuthn without exposing userId in plaintext.
        const pendingToken = jwt.sign(
          { sub: userId, purpose: STEP_UP_PURPOSE, ip, userAgent },
          config.JWT_SECRET,
          { expiresIn: STEP_UP_TTL }
        );
        logger.info({ userId, score }, '[auth] login/verify: step-up required');
        res.json({ stepUpRequired: true, method: 'totp', pendingToken });
        return;
      }

      // Low risk — issue full session immediately
      logger.info({ userId }, '[auth] login/verify: issuing session (low risk)');
      const tokens = await issueSession(userId, ip, userAgent);
      logger.info({ userId }, '[auth] login/verify: session issued');
      res.json(tokens);
    } catch (err) {
      const isError = err instanceof Error;
      const message = isError && err.message ? err.message : 'verification failed';
      logAuthError('login/verify', err, { email });
      const status = message.includes('no pending') ? 400 : 401;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/login/step-up ──────────────────────────────────────────
// Body: { pendingToken: string, code: string }
// Returns: { accessToken: string, refreshToken: string } on success
// Verifies the TOTP code then issues a full session.
router.post(
  '/login/step-up',
  async (req: Request, res: Response): Promise<void> => {
    const { pendingToken, code } = req.body as {
      pendingToken?: string;
      code?: string;
    };

    if (!pendingToken || typeof pendingToken !== 'string') {
      res.status(400).json({ error: 'pendingToken is required' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      // M8.2 — Rate-limit check: decode token without verifying signature to get userId,
      // then record the attempt. If >3 in 60 s → 429 immediately.
      const decoded0 = jwt.decode(pendingToken) as { sub?: string; purpose?: string } | null;
      const candidateUserId = decoded0?.sub ?? '';
      if (candidateUserId) {
        const blocked = recordStepUpAttempt(candidateUserId);
        if (blocked) {
          res.status(429).json({ blocked: true, error: 'too many step-up attempts — try again later' });
          return;
        }
      }

      // 1. Full JWT verify (checks signature + expiry)
      const decoded = jwt.verify(pendingToken, config.JWT_SECRET) as {
        sub: string;
        purpose: string;
        ip?: string;
        userAgent?: string;
      };

      if (decoded.purpose !== STEP_UP_PURPOSE) {
        res.status(401).json({ error: 'invalid pending token' });
        return;
      }

      const userId = decoded.sub;

      // 2. Verify TOTP code via existing totp.service
      await verifyCode(userId, code);

      // 3. TOTP passed — issue full session
      const tokens = await issueSession(
        userId,
        decoded.ip,
        decoded.userAgent
      );
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'step-up failed';
      const status =
        message.includes('invalid') || message.includes('expired') || message.includes('TOTP')
          ? 401
          : 400;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/totp/setup ──────────────────────────────────────────────
// Body: { userId: string }
// Returns: { secret: string, otpauthUrl: string }
// Note: auth middleware applied in M4.9 — userId accepted directly for now.
router.post(
  '/totp/setup',
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.body as { userId?: string };

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    try {
      const payload = await generateSecretForUser(userId);
      res.json(payload);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'internal error';
      const status = message === 'user not found' ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/totp/verify ─────────────────────────────────────────────
// Body: { userId: string, code: string }
// Returns: { enabled: true }
router.post(
  '/totp/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { userId, code } = req.body as { userId?: string; code?: string };

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      await verifyCode(userId, code.trim());
      res.json({ enabled: true });
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'verification failed';
      const status =
        message === 'user not found' ? 404
        : message.includes('not set up') ? 400
        : message === 'invalid TOTP code' ? 422
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── POST /api/auth/refresh ───────────────────────────────────────────────
// Body: { refreshToken: string }
// Returns: { accessToken: string, refreshToken: string }
// Reuse detected: 401 + full family revoked
router.post(
  '/refresh',
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({ error: 'refreshToken is required' });
      return;
    }

    try {
      const tokens = await rotateRefreshToken(refreshToken);
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'token rotation failed';
      const status =
        message === 'invalid refresh token' ? 401
        : message === 'refresh token expired' ? 401
        : message.includes('reuse detected') ? 401
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// ── GET /api/auth/sessions ────────────────────────────────────────────────
// Returns active (non-revoked, non-expired) refresh token families for the
// current user, joined with their most recent login_event for device context.
router.get(
  '/sessions',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId as string;
    try {
      const { rows } = await pool.query<{
        id: string;
        family_id: string;
        created_at: Date;
        expires_at: Date;
        ip: string | null;
        user_agent: string | null;
        last_seen: Date | null;
      }>(
        `SELECT
           rt.id,
           rt.family_id,
           rt.created_at,
           rt.expires_at,
           le.ip,
           le.user_agent,
           le.created_at AS last_seen
         FROM refresh_tokens rt
         LEFT JOIN LATERAL (
           SELECT ip, user_agent, created_at
           FROM login_events
           WHERE user_id = rt.user_id
           ORDER BY created_at DESC
           LIMIT 1
         ) le ON true
         WHERE rt.user_id = $1
           AND rt.revoked = false
           AND rt.expires_at > now()
         ORDER BY rt.created_at DESC
         LIMIT 20`,
        [userId]
      );
      res.json(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

// ── DELETE /api/auth/sessions/:familyId ──────────────────────────────────
// Revokes all tokens in the specified family for the current user.
router.delete(
  '/sessions/:familyId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId as string;
    const { familyId } = req.params as { familyId: string };
    try {
      const { rowCount } = await pool.query(
        `UPDATE refresh_tokens
         SET revoked = true
         WHERE family_id = $1 AND user_id = $2 AND revoked = false`,
        [familyId, userId]
      );
      if (!rowCount || rowCount === 0) {
        res.status(404).json({ error: 'session not found or already revoked' });
        return;
      }
      res.json({ revoked: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

// ── GET /api/auth/audit ───────────────────────────────────────────────────
// Returns recent audit log entries whose payload references the current userId.
// Limit: 50 most recent entries.
router.get(
  '/audit',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId as string;
    try {
      const { rows } = await pool.query<{
        id: string;
        entry_type: string;
        payload: unknown;
        created_at: Date;
      }>(
        `SELECT id, entry_type, payload, created_at
         FROM audit_log
         WHERE payload @> $1::jsonb
            OR payload @> $2::jsonb
         ORDER BY id DESC
         LIMIT 50`,
        [JSON.stringify({ userId }), JSON.stringify({ approverId: userId })]
      );
      res.json(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

export default router;
