/**
 * Result Parser — Claude Code JSON 출력 파싱 및 정책 검증
 *
 * Claude Code의 실행 결과를 파싱하고,
 * 변경된 파일 목록을 추출하여 하네스 정책 위반을 체크한다.
 */

import type { ClaudeCodeResult, Environment } from '@rtb-ai-hub/shared';
import { PolicyEngine, type PolicyContext } from '../harness/policy-engine';
import { createLogger } from '@rtb-ai-hub/shared';

const logger = createLogger('result-parser');

export type ParsedResult = {
  codeResult: ClaudeCodeResult;
  policyCheck: {
    allowed: boolean;
    violations: string[];
    warnings: string[];
  };
};

/** Parse Claude Code result and check against policies */
export function parseAndValidate(
  result: ClaudeCodeResult,
  env: Environment,
  policyEngine?: PolicyEngine
): ParsedResult {
  const policyCheck = {
    allowed: true,
    violations: [] as string[],
    warnings: [] as string[],
  };

  if (!policyEngine || result.filesChanged.length === 0) {
    return { codeResult: result, policyCheck };
  }

  const context: PolicyContext = {
    env,
    changedFiles: result.filesChanged,
  };

  const checkResult = policyEngine.check(context);

  policyCheck.allowed = checkResult.allowed;
  policyCheck.violations = checkResult.violations.map((v) => `[${v.policyName}] ${v.message}`);
  policyCheck.warnings = checkResult.warnings.map((w) => `[${w.policyName}] ${w.message}`);

  if (!policyCheck.allowed) {
    logger.error(
      { violations: policyCheck.violations, filesChanged: result.filesChanged },
      'Policy violations detected in Claude Code result'
    );
  }

  if (policyCheck.warnings.length > 0) {
    logger.warn(
      { warnings: policyCheck.warnings },
      'Policy warnings in Claude Code result'
    );
  }

  return { codeResult: result, policyCheck };
}

/** Extract changed file paths from git diff output */
export function extractChangedFiles(gitDiffOutput: string): string[] {
  return gitDiffOutput
    .split('\n')
    .filter((line) => line.match(/^[AMDR]\t/))
    .map((line) => line.replace(/^[AMDR]\t/, '').trim())
    .filter(Boolean);
}
