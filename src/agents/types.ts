export type PipelineStep = 'install' | 'investigate' | 'fix' | 'commitPushPr';

export const STEP_PROMPTS: Record<PipelineStep, string> = {
  install:
    'Install project dependencies (npm install, yarn, pnpm, uv sync, etc.) so the project is ready to run.',
  investigate:
    'Read error-context.md in this repo. Investigate the error and identify the cause.',
  fix: 'Using your investigation, fix the error. Apply code changes in this repo.',
  commitPushPr:
    'Create a new branch with a descriptive name related to the issue (e.g. fix/sqlite-connection-error, fix/timeout-handling). Commit your changes, push the branch, and open a pull request.',
};

export interface AgentProvider {
  readonly name: string;
  runStep(cwd: string, step: PipelineStep): boolean;
}
