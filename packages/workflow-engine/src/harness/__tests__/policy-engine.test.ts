import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEngine } from '../policy-engine';

vi.mock('@rtb-ai-hub/shared', async () => {
  const actual = await vi.importActual<typeof import('@rtb-ai-hub/shared')>('@rtb-ai-hub/shared');
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  };
});

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('prd environment policies', () => {
    it('blocks SQL file changes in prd', () => {
      const result = engine.check({
        env: 'prd',
        changedFiles: ['drizzle/0007_add_table.sql'],
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].policyId).toBe('prd-no-db-schema-change');
    });

    it('warns about debug code in prd', () => {
      const result = engine.check({
        env: 'prd',
        changedFiles: ['src/app.ts'],
        fileContents: new Map([['src/app.ts', 'const x = 1;\nconsole.log(x);']]),
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].policyId).toBe('prd-no-debug-code');
    });

    it('blocks force push in prd', () => {
      const result = engine.check({
        env: 'prd',
        action: 'force-push',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.policyId === 'prd-no-force-push')).toBe(true);
    });
  });

  describe('stg environment policies', () => {
    it('blocks force push in stg', () => {
      const result = engine.check({
        env: 'stg',
        action: 'force-push',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.policyId === 'stg-no-force-push')).toBe(true);
    });

    it('allows normal changes in stg', () => {
      const result = engine.check({
        env: 'stg',
        changedFiles: ['src/feature.ts'],
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('int environment policies', () => {
    it('allows SQL changes in int', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['drizzle/0007_add_table.sql'],
      });

      // int should not block SQL changes (that policy is env:prd specific)
      const sqlViolation = result.violations.find(
        (v) => v.policyId === 'prd-no-db-schema-change'
      );
      expect(sqlViolation).toBeUndefined();
    });
  });

  describe('file-based policies', () => {
    it('requires approval for docker-compose changes', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['docker-compose.yml'],
      });

      const configViolation = result.violations.find(
        (v) => v.policyId === 'protected-config-files'
      );
      expect(configViolation).toBeDefined();
      expect(configViolation!.action).toBe('require-approval');
    });

    it('requires approval for Dockerfile changes', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['Dockerfile.production'],
      });

      const violation = result.violations.find(
        (v) => v.policyId === 'protected-config-files'
      );
      expect(violation).toBeDefined();
    });

    it('requires approval for .env changes', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['.env.production'],
      });

      const violation = result.violations.find(
        (v) => v.policyId === 'protected-config-files'
      );
      expect(violation).toBeDefined();
    });

    it('requires approval for drizzle migration changes', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['drizzle/0008_new_migration.sql'],
      });

      const violation = result.violations.find(
        (v) => v.policyId === 'protected-config-files'
      );
      expect(violation).toBeDefined();
    });
  });

  describe('content-based policies', () => {
    it('blocks potential secret exposure', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['src/config.ts'],
        fileContents: new Map([
          ['src/config.ts', 'const API_KEY = "sk-12345"'],
        ]),
      });

      const secretViolation = result.violations.find(
        (v) => v.policyId === 'no-secret-exposure'
      );
      expect(secretViolation).toBeDefined();
      expect(secretViolation!.action).toBe('block');
    });

    it('allows code without secrets', () => {
      const result = engine.check({
        env: 'int',
        changedFiles: ['src/app.ts'],
        fileContents: new Map([
          ['src/app.ts', 'export function hello() { return "world"; }'],
        ]),
      });

      const secretViolation = result.violations.find(
        (v) => v.policyId === 'no-secret-exposure'
      );
      expect(secretViolation).toBeUndefined();
    });
  });

  describe('generateConstraints', () => {
    it('generates constraints for prd environment', () => {
      const constraints = engine.generateConstraints('prd');

      expect(constraints).toContain('Execution Constraints');
      expect(constraints).toContain('DB schema changes are not allowed');
      expect(constraints).toContain('Force push is not allowed');
    });

    it('generates constraints for stg environment', () => {
      const constraints = engine.generateConstraints('stg');

      expect(constraints).toContain('Force push is not allowed');
    });

    it('includes file-based policies', () => {
      const constraints = engine.generateConstraints('int');

      expect(constraints).toContain('infrastructure/config files');
      expect(constraints).toContain('secret exposure');
    });
  });

  describe('policy management', () => {
    it('adds custom policy', () => {
      engine.addPolicy({
        id: 'custom-policy',
        name: 'Custom test policy',
        scope: 'env',
        condition: 'env:int && action:deploy',
        action: 'block',
        message: 'Custom block',
        enabled: true,
      });

      const result = engine.check({ env: 'int', action: 'deploy' });
      expect(result.violations.some((v) => v.policyId === 'custom-policy')).toBe(true);
    });

    it('removes policy by id', () => {
      engine.removePolicy('prd-no-db-schema-change');

      const result = engine.check({
        env: 'prd',
        changedFiles: ['drizzle/migration.sql'],
      });

      const removed = result.violations.find(
        (v) => v.policyId === 'prd-no-db-schema-change'
      );
      expect(removed).toBeUndefined();
    });

    it('disabled policies are not evaluated', () => {
      const customEngine = new PolicyEngine([
        {
          id: 'disabled-policy',
          name: 'Disabled policy',
          scope: 'env',
          condition: 'env:int',
          action: 'block',
          message: 'Should not fire',
          enabled: false,
        },
      ]);

      const result = customEngine.check({ env: 'int' });
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('no changed files', () => {
    it('does not trigger file-based policies without changed files', () => {
      const result = engine.check({ env: 'prd' });

      const fileViolations = result.violations.filter(
        (v) => v.policyId === 'protected-config-files' || v.policyId === 'prd-no-db-schema-change'
      );
      expect(fileViolations).toHaveLength(0);
    });
  });
});
