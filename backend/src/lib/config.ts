import { config as loadEnv } from 'dotenv';

loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] FATAL: missing required environment variable "${name}"`);
    process.exit(1);
  }
  return value;
}

function parseOrigins(value: string): string[] {
  return [...new Set(value.split(',').map((o) => o.trim()).filter(Boolean))];
}

function parseSecrets(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

const jwtSecret = requireEnv('JWT_SECRET');
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174';

const config = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: jwtSecret,
  SIGNING_KEY_ENCRYPTION_SECRET: process.env.SIGNING_KEY_ENCRYPTION_SECRET || jwtSecret,
  SIGNING_KEY_PREVIOUS_ENCRYPTION_SECRETS: parseSecrets(process.env.SIGNING_KEY_PREVIOUS_ENCRYPTION_SECRETS),
  PORT: parseInt(process.env.PORT || '4000', 10),
  FRONTEND_ORIGINS: parseOrigins(frontendOrigin),
};

export default config;
