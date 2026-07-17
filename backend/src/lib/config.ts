import { config as loadEnv } from 'dotenv';

// Load .env file (no-op if already set by the environment)
loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] FATAL: missing required environment variable "${name}"`);
    process.exit(1);
  }
  return value;
}

const config = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  PORT: parseInt(process.env.PORT || '4000', 10),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
};

export default config;
