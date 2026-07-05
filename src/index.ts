import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { assertOAuthConfigOrThrow } from './auth/oauth.js';
import { claimNext, reclaimAbandonedOnStartup, setStatus } from './queue/db.js';
import { requireBearerAuth } from './middleware/requireBearerAuth.js';
import { runPipeline, handleError } from './utils/errorHandler.js';
import { logger } from './utils/logger.js';
import { runWorkspaceCleanup } from './utils/workspaceCleanup.js';
import { config } from './config.js';
import openApiSpec from './openapi.json' with { type: 'json' };
import { scalarReferenceHtml } from './scalarReference.js';

import rootRoutes from './routes/root.js';
import errorRoutes from './routes/error.js';
import queueRoutes from './routes/queue.js';
import triggerRoutes from './routes/trigger.js';
import workspaceRoutes from './routes/workspace.js';
import oauthRoutes from './routes/oauth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAVICON_ICO_PATH = join(__dirname, 'favico.ico');
let faviconIcoCache: Buffer | null | undefined;

function getFaviconIco(): Buffer | null {
  if (faviconIcoCache !== undefined) return faviconIcoCache;
  try {
    faviconIcoCache = readFileSync(FAVICON_ICO_PATH);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      faviconIcoCache = null;
      logger.warn('favicon not found', { path: FAVICON_ICO_PATH });
      return null;
    }
    throw err;
  }
  return faviconIcoCache;
}

assertOAuthConfigOrThrow();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Public routes (no auth)
app.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

app.get('/reference', (_req: Request, res: Response) => {
  res.type('text/html').send(
    scalarReferenceHtml({ specUrl: '/openapi.json', pageTitle: 'Self-healing API' }),
  );
});

app.get('/favicon.ico', (_req: Request, res: Response) => {
  const icon = getFaviconIco();
  if (!icon) {
    res.status(404).end();
    return;
  }
  res.type('image/x-icon').send(icon);
});

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info('request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      ip,
      ...(req.route ? { route: req.route.path } : {}),
    });
  });
  next();
});

// OAuth middleware (no-ops if disabled)
app.use(requireBearerAuth);

// Mount routers
app.use('/', rootRoutes);
app.use('/oauth', oauthRoutes);
app.use('/error', errorRoutes);
app.use('/queue', queueRoutes);
app.use('/queue', triggerRoutes);
app.use('/workspace', workspaceRoutes);

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  handleError(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Worker
let isWorkerRunning = false;
let workerShouldStop = false;
let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

function runWorkerLoop(): void {
  if (workerShouldStop) {
    isWorkerRunning = false;
    return;
  }
  const job = claimNext();
  if (!job) {
    if (!workerShouldStop) {
      pollTimeoutId = setTimeout(runWorkerLoop, config.queue.pollIntervalMs);
    }
    return;
  }
  logger.info('worker claimed job', { jobId: job.id, source: job.report.source });
  runPipeline(job.report)
    .then(() => {
      setStatus(job.id, 'done');
      logger.info('worker job done', { jobId: job.id });
    })
    .catch((err) => {
      setStatus(job.id, 'failed');
      logger.warn('worker job failed', { jobId: job.id, error: String(err) });
    })
    .finally(() => {
      if (!workerShouldStop) runWorkerLoop();
    });
}

function startWorker(): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;
  workerShouldStop = false;
  runWorkerLoop();
}

function stopWorker(): void {
  workerShouldStop = true;
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
    pollTimeoutId = null;
  }
  isWorkerRunning = false;
}

// Wire trigger route to worker
app.locals.triggerStartWorker = startWorker;

// Workspace auto-cleanup
function startWorkspaceCleanupSchedule(): void {
  async function runCleanup(): Promise<void> {
    try {
      const deleted = await runWorkspaceCleanup(config.workspace.retentionDays, false);
      if (deleted.length > 0) {
        logger.info('workspace cleanup ran', { deletedCount: deleted.length, deleted });
      }
    } catch (err) {
      logger.warn('workspace cleanup error', { error: String(err) });
    }
  }

  setTimeout(() => {
    runCleanup();
    setInterval(runCleanup, config.workspace.cleanupIntervalMs);
  }, config.workspace.cleanupFirstDelayMs);
}

export { app, startWorker, stopWorker };

if (config.nodeEnv !== 'test') {
  app.listen(config.port, () => {
    reclaimAbandonedOnStartup();
    logger.info('server started', {
      pid: process.pid,
      nodeVersion: process.version,
      env: config.nodeEnv,
      port: config.port,
      url: `http://localhost:${config.port}`,
    });
    startWorker();
    startWorkspaceCleanupSchedule();
  });
}
