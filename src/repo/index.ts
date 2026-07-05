import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ErrorReport } from '../schemas/errorReport.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const CLONE_TIMEOUT_MS = 60_000;

/** Derive a fs-safe slug from source URL/path (e.g. last path segment, sanitized). */
export function sourceToSlug(source: string): string {
  let base: string;
  try {
    const url = new URL(source);
    const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    base = segments[segments.length - 1] || 'repo';
  } catch {
    base = source;
  }

  return (
    base
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'repo'
  );
}

/** Resolve workspace root and clone dir: workspace/<slug>-<timestamp>. */
export function getCloneDir(source: string): string {
  const workspaceRoot = path.join(process.cwd(), config.workspace.dir);
  const slug = sourceToSlug(source);
  const timestamp = Date.now();
  return path.join(workspaceRoot, `${slug}-${timestamp}`);
}

/** Validate git source URL to prevent option injection and local file reads. */
export function isValidGitUrl(source: string): boolean {
  if (source.startsWith('-')) return false;
  if (/^(https?|git|ssh):\/\//.test(source)) return true;
  if (source.includes('\\')) return false;
  const colonParts = source.split(':');
  if (colonParts.length === 2) {
    const [before, after] = colonParts;
    if (/^([^@\s]+@)?[^@\s/]+$/.test(before) && after.length > 0 && !after.startsWith('/')) {
      return true;
    }
  }
  return false;
}

/** Clone the given branch of source into cloneDir. Returns true on success. */
export function cloneRepo(source: string, cloneDir: string, branch: string): boolean {
  const trimmedBranch = branch.trim();
  if (trimmedBranch.startsWith('-')) {
    logger.error('[repo] invalid git branch', { branch: trimmedBranch });
    return false;
  }
  if (!isValidGitUrl(source)) {
    logger.error('[repo] invalid git source', { source });
    return false;
  }
  mkdirSync(path.dirname(cloneDir), { recursive: true });
  const args = ['clone', '-b', trimmedBranch, '--', source, cloneDir];
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: CLONE_TIMEOUT_MS,
  });
  if (r.status !== 0) {
    logger.error('[repo] git clone failed', { detail: r.stderr || r.stdout || r.error });
    return false;
  }
  return true;
}

const GITIGNORE_ENTRY = `\n# Self-healing pipeline (do not commit)\n${config.errorContextFile}\n`;

/** Write error context file into the clone. Appends .gitignore so it is not committed. */
export function writeErrorContext(cloneDir: string, report: ErrorReport): void {
  const lines: string[] = [
    '# Error context',
    '',
    `**Message:** ${report.message}`,
    '',
    report.stack ? `**Stack:**\n\`\`\`\n${report.stack}\n\`\`\`` : '',
    report.timestamp ? `**Timestamp:** ${report.timestamp}` : '',
    report.metadata && Object.keys(report.metadata).length > 0
      ? `**Metadata:**\n\`\`\`json\n${JSON.stringify(report.metadata, null, 2)}\n\`\`\``
      : '',
  ].filter(Boolean);

  const filePath = path.join(cloneDir, config.errorContextFile);
  writeFileSync(filePath, lines.join('\n'), 'utf8');

  const gitignorePath = path.join(cloneDir, '.gitignore');
  try {
    const existing = readFileSync(gitignorePath, 'utf8');
    if (!existing.includes(config.errorContextFile)) {
      appendFileSync(gitignorePath, GITIGNORE_ENTRY, 'utf8');
    }
  } catch {
    // No .gitignore in clone; cleanupErrorContext before commit will remove the file
  }
}

/** Remove error context file from clone so it is never committed. */
export function cleanupErrorContext(cloneDir: string): void {
  const filePath = path.join(cloneDir, config.errorContextFile);
  try {
    unlinkSync(filePath);
  } catch {
    // Ignore if already missing
  }
}
