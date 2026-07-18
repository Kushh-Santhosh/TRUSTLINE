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

function parseSecrets(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map((secret) => secret.trim()).filter(Boolean))];
}

const frontendOrigin = process.env.FRONTEND_ORIGIN || DEFAULT_DEVELOPMENT_ORIGINS;
const jwtSecret = requireEnv('JWT_SECRET');

const config = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: requireEnv('REDIS_URL'),
  JWT_SECRET: jwtSecret,
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  // Signing keys are encrypted independently from session JWTs when configured.
  // The optional previous keys are used only to migrate existing development
  // records after a local secret configuration was corrected.
  SIGNING_KEY_ENCRYPTION_SECRET: process.env.SIGNING_KEY_ENCRYPTION_SECRET || jwtSecret,
  SIGNING_KEY_PREVIOUS_ENCRYPTION_SECRETS: parseSecrets(process.env.SIGNING_KEY_PREVIOUS_ENCRYPTION_SECRETS),
  PORT: parseInt(process.env.PORT || '4000', 10),
  // Comma-separated origins are supported for local development when Vite
  // increments its port because the default one is already occupied.
  FRONTEND_ORIGIN: frontendOrigin,
  FRONTEND_ORIGINS: parseOrigins(frontendOrigin),
};

export default config;
