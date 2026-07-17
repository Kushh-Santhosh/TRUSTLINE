import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import logger from './lib/logger';
import config from './lib/config';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth.routes';
import approvalRouter from './routes/approval.routes';
import ledgerRouter from './routes/ledger.routes';
import riskRouter from './routes/risk.routes';

const app = express();

// Request logging — must be first
app.use(pinoHttp({ logger }));

// Body parsing
app.use(express.json());

// CORS — allow frontend origin from validated config
app.use(cors({ origin: config.FRONTEND_ORIGIN, credentials: true }));

import pool from './db/pool';

// Health check — do not remove
// Returns { status: 'ok', db: 'ok' } when fully healthy.
// Returns { status: 'ok', db: 'error', dbError: '...' } when DB is unreachable.
// This makes dependency failures visible without crashing the server.
app.get('/health', async (_req, res) => {
  let db: 'ok' | 'error' = 'ok';
  let dbError: string | undefined;

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    db = 'error';
    dbError = err instanceof Error ? err.message : String(err);
  }

  res.json({ status: 'ok', db, ...(dbError ? { dbError } : {}) });
});

// API routers
app.use('/api/auth', authRouter);
app.use('/api/approval', approvalRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/risk', riskRouter);

// Centralized error handler — must be last
app.use(errorHandler);

export default app;
