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

const STEP_UP_TTL = '5m';

function authError(endpoint: string, err: unknown, ctx: Record<string, unknown> = {}): string {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err && typeof err === 'object' && 'code' in err)
    ? String((err as Record<string, unknown>).code)
    : undefined;
  const isDbDown = code === 'ECONNREFUSED' || message.includes('ECONNREFUSED');

  logger.error(
    { endpoint, err, isDbDown, ...ctx },
    isDbDown
      ? `[auth] ${endpoint}: database unreachable — start PostgreSQL first`
      : `[auth] ${endpoint}: error`
  );

  return isDbDown ? 'database not reachable — is PostgreSQL running?' : message;
}

const router = Router();

// POST /api/auth/register/options
router.post(
  '/register/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const options = await generateRegistrationOptionsForUser(email.trim().toLowerCase());
      res.json(options);
    } catch (err) {
      const message = authError('register/options', err, { email });
      res.status(500).json({ error: message });
    }
  }
);

// POST /api/auth/register/verify
router.post(
  '/register/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as { email?: string; response?: unknown };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response is required' });
      return;
    }

    try {
      const { userId } = await verifyRegistration(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyRegistration>[1]
      );
      res.json({ verified: true, userId });
    } catch (err) {
      const message = authError('register/verify', err, { email });
      const status = message.includes('no pending challenge') ? 400 : 422;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/login/options
router.post(
  '/login/options',
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    try {
      const options = await generateLoginOptionsForUser(email.trim().toLowerCase());
      res.json(options);
    } catch (err) {
      const message = authError('login/options', err, { email });
      const status = message.includes('no credentials') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/login/verify
// Low-risk  → 200 { accessToken, refreshToken }
// Medium/high risk → 200 { stepUpRequired: true, method: 'totp', pendingToken }
router.post(
  '/login/verify',
  async (req: Request, res: Response): Promise<void> => {
    const { email, response } = req.body as { email?: string; response?: unknown };

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

    try {
      const userId = await verifyLogin(
        email.trim().toLowerCase(),
        response as Parameters<typeof verifyLogin>[1]
      );

      const { score } = await scoreLoginRisk(userId, ip, userAgent);

      if (score === 'medium' || score === 'high') {
        const pendingToken = jwt.sign(
          { sub: userId, purpose: 'step_up', ip, userAgent },
          config.JWT_SECRET,
          { expiresIn: STEP_UP_TTL }
        );
        res.json({ stepUpRequired: true, method: 'totp', pendingToken });
        return;
      }

      const tokens = await issueSession(userId, ip, userAgent);
      res.json(tokens);
    } catch (err) {
      const message = authError('login/verify', err, { email });
      const status = message.includes('no pending') ? 400 : 401;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/login/step-up
router.post(
  '/login/step-up',
  async (req: Request, res: Response): Promise<void> => {
    const { pendingToken, code } = req.body as { pendingToken?: string; code?: string };

    if (!pendingToken || typeof pendingToken !== 'string') {
      res.status(400).json({ error: 'pendingToken is required' });
      return;
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      // Rate-limit check: decode without verifying to get userId and record the attempt.
      const decoded0 = jwt.decode(pendingToken) as { sub?: string } | null;
      const candidateUserId = decoded0?.sub ?? '';
      if (candidateUserId) {
        const blocked = recordStepUpAttempt(candidateUserId);
        if (blocked) {
          res.status(429).json({ blocked: true, error: 'too many step-up attempts — try again later' });
          return;
        }
      }

      const decoded = jwt.verify(pendingToken, config.JWT_SECRET) as {
        sub: string;
        purpose: string;
        ip?: string;
        userAgent?: string;
      };

      if (decoded.purpose !== 'step_up') {
        res.status(401).json({ error: 'invalid pending token' });
        return;
      }

      const userId = decoded.sub;
      await verifyCode(userId, code);

      const tokens = await issueSession(userId, decoded.ip, decoded.userAgent);
      res.json(tokens);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'step-up failed';
      const status =
        message.includes('invalid') || message.includes('expired') || message.includes('TOTP')
          ? 401
          : 400;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/totp/setup
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
      const message = err instanceof Error ? err.message : 'internal error';
      const status = message === 'user not found' ? 404 : 500;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/totp/verify
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
      const message = err instanceof Error ? err.message : 'verification failed';
      const status =
        message === 'user not found'     ? 404
        : message.includes('not set up') ? 400
        : message === 'invalid TOTP code'? 422
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// POST /api/auth/refresh — rotates refresh token; replay → 401 + full family revoked
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
      const message = err instanceof Error ? err.message : 'token rotation failed';
      const status =
        message === 'invalid refresh token'     ? 401
        : message === 'refresh token expired'   ? 401
        : message.includes('reuse detected')    ? 401
        : 500;
      res.status(status).json({ error: message });
    }
  }
);

// GET /api/auth/sessions — active token families for the current user
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

// GET /api/auth/security-status — authentication enrollment state for the current user.
// This is intentionally read-only and returns only state already persisted in users
// and webauthn_credentials; it does not alter login, session, or approval behavior.
router.get(
  '/security-status',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await pool.query<{
        passkey_registered: boolean;
        mfa_enabled: boolean;
      }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM webauthn_credentials WHERE user_id = u.id
           ) AS passkey_registered,
           u.totp_enabled AS mfa_enabled
         FROM users u
         WHERE u.id = $1`,
        [req.userId as string]
      );

      if (!rows[0]) {
        res.status(404).json({ error: 'user not found' });
        return;
      }

      res.json({
        passkeyRegistered: rows[0].passkey_registered,
        mfaEnabled: rows[0].mfa_enabled,
        // Every authenticated dashboard session is established through the
        // passkey login flow. TOTP is an adaptive step-up, not a replacement.
        currentAuthenticationMethod: 'Passkey',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'internal error';
      res.status(500).json({ error: message });
    }
  }
);

// DELETE /api/auth/sessions/:familyId — revokes all tokens in a family
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

// GET /api/auth/audit — recent audit log entries for the current user (last 50)
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
