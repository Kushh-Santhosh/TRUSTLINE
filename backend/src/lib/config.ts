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

const DEFAULT_DEVELOPMENT_ORIGINS = 'http://localhost:5173,http://localhost:5174';

function parseOrigins(value: string): string[] {
  return [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))];
}

const frontendOrigin = process.env.FRONTEND_ORIGIN || DEFAULT_DEVELOPMENT_ORIGINS;

const config = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  PORT: parseInt(process.env.PORT || '4000', 10),
  // Comma-separated origins are supported for local development when Vite
  // increments its port because the default one is already occupied.
  FRONTEND_ORIGIN: frontendOrigin,
  FRONTEND_ORIGINS: parseOrigins(frontendOrigin),
};

export default config;
