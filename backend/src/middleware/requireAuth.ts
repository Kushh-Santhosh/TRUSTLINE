/**
 * M4.9 — requireAuth middleware
 * Reads Authorization: Bearer <token>, verifies the JWT with config.JWT_SECRET,
 * and attaches req.userId for downstream handlers.
 *
 * Returns 401 for:
 *   - missing Authorization header
 *   - malformed Bearer token (not "Bearer <value>")
 *   - invalid JWT signature
 *   - expired JWT
 *
 * Usage: apply to any router or route that should be protected.
 *   router.get('/me', requireAuth, handler)
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../lib/config';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // 1. Must have an Authorization header
  if (!authHeader) {
    res.status(401).json({ error: 'authorization header is required' });
    return;
  }

  // 2. Must be in "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'malformed authorization header — expected: Bearer <token>' });
    return;
  }

  const token = parts[1];

  // 3. Verify JWT (checks signature + expiry)
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub?: string };

    if (!payload.sub) {
      res.status(401).json({ error: 'invalid token — missing subject' });
      return;
    }

    // 4. Attach userId for downstream handlers
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'token expired' });
    } else {
      res.status(401).json({ error: 'invalid token' });
    }
  }
}
