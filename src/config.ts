import { logger } from './utils/logger.js';

function getEnvInt(
  key: string,
  defaultValue: number,
  options: { min?: number; max?: number; context?: string } = {},
): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  const value = Math.floor(parsed);
  if (!Number.isFinite(value)) {
    if (options.context) {
      logger.warn(`${options.context}: ${key} invalid, using default`, { value: raw, default: defaultValue });
    }
    return defaultValue;
  }
  const { min, max } = options;
  const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, value));
  if (clamped !== value && options.context) {
    logger.warn(`${options.context}: ${key} clamped to bounds`, { value, clamped, min, max });
  }
  return clamped;
}

/** All resolved config. Access only after dotenv loaded. */
export const config = {
  port: Number(process.env.PORT) || 3000,

  nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',

  logLevel: (process.env.LOG_LEVEL?.toLowerCase() || 'info') as 'debug' | 'info' | 'warn' | 'error',

  queueDbPath: process.env.QUEUE_DB_PATH ?? 'data/queue.db',

  agentProvider: (process.env.AGENT_PROVIDER?.toLowerCase() || 'cursor') as 'cursor' | 'antigravity',

  /** Cursor / Antigravity API key for the agent CLI (only needed in Docker). */
  cursorApiKey: process.env.CURSOR_API_KEY ?? '',

  git: {
    token: process.env.GIT_TOKEN ?? '',
    url: process.env.GIT_URL ?? '',
    authorName: process.env.GIT_AUTHOR_NAME ?? '',
    authorEmail: process.env.GIT_AUTHOR_EMAIL ?? '',
    committerName: process.env.GIT_COMMITTER_NAME ?? '',
    committerEmail: process.env.GIT_COMMITTER_EMAIL ?? '',
  },

  workspace: {
    dir: 'workspace',
    retentionDays: getEnvInt('WORKSPACE_RETENTION_DAYS', 2, { min: 1, max: 365, context: 'workspace' }),
    cleanupIntervalMs: getEnvInt('WORKSPACE_CLEANUP_INTERVAL_MS', 6 * 60 * 60 * 1000, {
      min: 60_000,
      max: 7 * 24 * 60 * 60 * 1000,
      context: 'workspace',
    }),
    cleanupFirstDelayMs: 60_000,
  },

  queue: {
    pollIntervalMs: 1500,
    staleTimeoutMs: 10 * 60 * 1000,
  },

  oauth: {
    jwtSecret: (process.env.OAUTH_JWT_SECRET ?? '').trim(),
    clientsRaw: (process.env.OAUTH_CLIENTS ?? '').trim(),
    accessTokenTtlSeconds: getEnvInt('OAUTH_ACCESS_TOKEN_TTL_SECONDS', 3600, {
      min: 60,
      max: 86400,
    }),
  },

  /** Error context file written into the cloned repo for the agent to read. */
  errorContextFile: 'error-context.md',
} as const;

export { getEnvInt };
