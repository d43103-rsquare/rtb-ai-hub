import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  requireEnv,
  getEnv,
  getEnvNumber,
  calculateDuration,
  formatDuration,
  RTBError,
  isRTBError,
  retry,
} from '../utils';

describe('generateId', () => {
  it('returns string with correct prefix', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test_\d+_[a-z0-9]{7}$/);
  });

  it('uses different prefixes correctly', () => {
    const figmaId = generateId('figma');
    const jiraId = generateId('jira');
    expect(figmaId.startsWith('figma_')).toBe(true);
    expect(jiraId.startsWith('jira_')).toBe(true);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('u')));
    expect(ids.size).toBe(100);
  });
});

describe('requireEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns value when env var is set', () => {
    process.env.TEST_VAR = 'hello';
    expect(requireEnv('TEST_VAR')).toBe('hello');
  });

  it('throws when env var is not set', () => {
    delete process.env.MISSING_VAR;
    expect(() => requireEnv('MISSING_VAR')).toThrow(
      'Required environment variable MISSING_VAR is not set'
    );
  });

  it('throws when env var is empty string', () => {
    process.env.EMPTY_VAR = '';
    expect(() => requireEnv('EMPTY_VAR')).toThrow(
      'Required environment variable EMPTY_VAR is not set'
    );
  });
});

describe('getEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns env var value when set', () => {
    process.env.MY_VAR = 'value';
    expect(getEnv('MY_VAR', 'default')).toBe('value');
  });

  it('returns default when env var is not set', () => {
    delete process.env.UNSET_VAR;
    expect(getEnv('UNSET_VAR', 'fallback')).toBe('fallback');
  });

  it('returns default when env var is empty string', () => {
    process.env.EMPTY = '';
    expect(getEnv('EMPTY', 'default')).toBe('default');
  });
});

describe('getEnvNumber', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses numeric env var correctly', () => {
    process.env.PORT = '3000';
    expect(getEnvNumber('PORT', 8080)).toBe(3000);
  });

  it('returns default when env var is not set', () => {
    delete process.env.MISSING_PORT;
    expect(getEnvNumber('MISSING_PORT', 8080)).toBe(8080);
  });

  it('throws when env var is not a number', () => {
    process.env.BAD_PORT = 'abc';
    expect(() => getEnvNumber('BAD_PORT', 8080)).toThrow(
      'Environment variable BAD_PORT must be a number, got: abc'
    );
  });
});

describe('calculateDuration', () => {
  it('returns correct millisecond difference', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-01T00:00:05Z');
    expect(calculateDuration(start, end)).toBe(5000);
  });

  it('returns 0 for same timestamps', () => {
    const now = new Date();
    expect(calculateDuration(now, now)).toBe(0);
  });

  it('returns negative for reversed timestamps', () => {
    const start = new Date('2024-01-01T00:00:05Z');
    const end = new Date('2024-01-01T00:00:00Z');
    expect(calculateDuration(start, end)).toBe(-5000);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(2500)).toBe('2.5s');
  });

  it('formats minutes', () => {
    expect(formatDuration(90000)).toBe('1.5m');
  });

  it('formats hours', () => {
    expect(formatDuration(5400000)).toBe('1.5h');
  });

  it('formats boundary at 1000ms as seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('formats boundary at 60000ms as minutes', () => {
    expect(formatDuration(60000)).toBe('1.0m');
  });

  it('formats boundary at 3600000ms as hours', () => {
    expect(formatDuration(3600000)).toBe('1.0h');
  });
});

describe('RTBError', () => {
  it('creates error with message and code', () => {
    const error = new RTBError('Something failed', 'ERR_001');
    expect(error.message).toBe('Something failed');
    expect(error.code).toBe('ERR_001');
    expect(error.name).toBe('RTBError');
    expect(error.details).toBeUndefined();
  });

  it('creates error with details', () => {
    const details = { field: 'email', reason: 'invalid' };
    const error = new RTBError('Validation error', 'VALIDATION', details);
    expect(error.details).toEqual(details);
  });

  it('is an instance of Error', () => {
    const error = new RTBError('test', 'TEST');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RTBError);
  });
});

describe('isRTBError', () => {
  it('returns true for RTBError instances', () => {
    const error = new RTBError('test', 'TEST');
    expect(isRTBError(error)).toBe(true);
  });

  it('returns false for regular Error', () => {
    const error = new Error('test');
    expect(isRTBError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isRTBError('string')).toBe(false);
    expect(isRTBError(null)).toBe(false);
    expect(isRTBError(undefined)).toBe(false);
    expect(isRTBError(42)).toBe(false);
  });
});

describe('retry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, { delay: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { attempts: 3, delay: 1 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after all attempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retry(fn, { attempts: 2, delay: 1 })).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('calls onRetry callback on each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');

    await retry(fn, { attempts: 2, delay: 1, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('uses default options when none provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn);
    expect(result).toBe('ok');
  });
});
