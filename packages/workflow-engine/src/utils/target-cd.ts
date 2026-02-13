import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { createLogger, loadTargetCdConfig, type TargetCdConfig } from '@rtb-ai-hub/shared';

const execAsync = promisify(exec);
const logger = createLogger('target-cd');

export type CdServiceResult = {
  service: string;
  success: boolean;
  rolledBack: boolean;
  durationMs: number;
  error?: string;
};

export type CdRunResult = {
  success: boolean;
  services: CdServiceResult[];
  totalDurationMs: number;
};

async function execInDir(
  command: string,
  cwd: string,
  timeoutMs = 120000
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(command, { cwd, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 });
}

async function getContainerHealth(
  service: string,
  cwd: string,
  composeFile: string
): Promise<string> {
  try {
    const { stdout } = await execInDir(
      `docker compose -f ${composeFile} ps --format json ${service}`,
      cwd,
      10000
    );
    const parsed = JSON.parse(stdout.trim());
    return parsed.Health || parsed.State || 'unknown';
  } catch {
    return 'missing';
  }
}

async function waitForHealth(
  service: string,
  cwd: string,
  composeFile: string,
  timeout: number,
  interval: number
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout * 1000) {
    const health = await getContainerHealth(service, cwd, composeFile);

    if (health === 'healthy') {
      logger.info({ service, elapsed: Date.now() - start }, 'Service healthy');
      return true;
    }
    if (health === 'unhealthy') {
      logger.error({ service }, 'Service unhealthy');
      return false;
    }

    await new Promise((r) => setTimeout(r, interval * 1000));
  }

  logger.error({ service, timeout }, 'Health check timed out');
  return false;
}

async function deployService(
  service: string,
  cwd: string,
  composeFile: string,
  healthTimeout: number,
  healthInterval: number
): Promise<CdServiceResult> {
  const start = Date.now();
  logger.info({ service }, 'Deploying service');

  try {
    await execInDir(`docker compose -f ${composeFile} build --no-cache ${service}`, cwd, 300000);
    await execInDir(`docker compose -f ${composeFile} up -d --no-deps ${service}`, cwd);

    const healthy = await waitForHealth(service, cwd, composeFile, healthTimeout, healthInterval);

    if (!healthy) {
      logger.warn({ service }, 'Health check failed — rolling back');
      await execInDir(`docker compose -f ${composeFile} up -d --no-deps ${service}`, cwd).catch(
        () => {}
      );
      const rolledBackOk = await waitForHealth(
        service,
        cwd,
        composeFile,
        healthTimeout,
        healthInterval
      );

      return {
        service,
        success: false,
        rolledBack: rolledBackOk,
        durationMs: Date.now() - start,
        error: 'Health check failed after deploy',
      };
    }

    return { service, success: true, rolledBack: false, durationMs: Date.now() - start };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ service, error: msg }, 'Deploy failed');

    return {
      service,
      success: false,
      rolledBack: false,
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}

export async function runTargetCd(config?: Partial<TargetCdConfig>): Promise<CdRunResult> {
  const cdConfig = { ...loadTargetCdConfig(), ...config };
  const { composeFile, services, healthTimeout, healthInterval, workDir } = cdConfig;

  if (!workDir) {
    logger.warn('No WORK_REPO_LOCAL_PATH configured — skipping CD');
    return { success: false, services: [], totalDurationMs: 0 };
  }

  try {
    await access(workDir);
  } catch {
    logger.error({ workDir }, 'Work repo directory not found');
    return { success: false, services: [], totalDurationMs: 0 };
  }

  if (services.length === 0) {
    logger.info('No CD services configured — skipping');
    return { success: true, services: [], totalDurationMs: 0 };
  }

  const start = Date.now();
  const results: CdServiceResult[] = [];

  for (const service of services) {
    const result = await deployService(
      service,
      workDir,
      composeFile,
      healthTimeout,
      healthInterval
    );
    results.push(result);

    if (!result.success) {
      logger.error({ service }, 'Stopping CD pipeline — service deploy failed');
      break;
    }
  }

  return {
    success: results.every((r) => r.success),
    services: results,
    totalDurationMs: Date.now() - start,
  };
}
