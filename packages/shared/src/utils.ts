/**
 * Shared Utilities for RTB AI Hub
 */

import pino from 'pino';

export function createLogger(name: string) {
  const baseConfig = {
    name,
    level: process.env.LOG_LEVEL || 'info',
  };

  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    try {
      return pino({
        ...baseConfig,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } catch {
      console.warn('pino-pretty not available, using basic logger');
    }
  }
  
  return pino(baseConfig);
}

// Environment Variable Helpers
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return parsed;
}

// ID Generation
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Time Utilities
export function calculateDuration(startTime: Date, endTime: Date): number {
  return endTime.getTime() - startTime.getTime();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// Error Handling
export class RTBError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'RTBError';
  }
}

export function isRTBError(error: unknown): error is RTBError {
  return error instanceof RTBError;
}

// Retry Utilities
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 'exponential',
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < attempts) {
        const waitTime =
          backoff === 'exponential' ? delay * Math.pow(2, attempt - 1) : delay * attempt;
        
        if (onRetry) {
          onRetry(lastError, attempt);
        }
        
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}
