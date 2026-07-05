import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ErrorReport } from '../schemas/errorReport.js';
import { resolveAgentProvider } from '../agents/factory.js';
import type { PipelineStep } from '../agents/types.js';
import { cloneRepo, writeErrorContext, cleanupErrorContext, getCloneDir } from '../repo/index.js';
import { logger } from './logger.js';

/**
 * Run the self-healing pipeline: clone repo, write error context, then run agent steps
 * (install → investigate → fix → commit/push/PR).
 */
export async function runPipeline(report: ErrorReport): Promise<void> {
  const source = report.source;
  if (!source?.trim()) {
    logger.error('[pipeline] source is required');
    throw new Error('source is required');
  }

  const cloneDir = getCloneDir(source);
  if (!cloneRepo(source, cloneDir, report.branch)) {
    throw new Error(`git clone failed (branch "${report.branch}" may not exist)`);
  }

  writeErrorContext(cloneDir, report);

  const agent = resolveAgentProvider();
  const steps: PipelineStep[] = ['install', 'investigate', 'fix', 'commitPushPr'];

  for (const step of steps) {
    if (step === 'commitPushPr') {
      cleanupErrorContext(cloneDir);
    }
    if (!agent.runStep(cloneDir, step)) {
      throw new Error(`Pipeline step "${step}" failed`);
    }
  }
}

/** Log error, write error.log at project root. Used by Express error middleware (no pipeline). */
export function handleError(error: Error): void {
  logger.error(error.message, { stack: error.stack });
  const content = [error.message, error.stack].filter(Boolean).join('\n\n');
  writeFileSync(path.join(process.cwd(), 'error.log'), content);
}
