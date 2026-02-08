import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validateBody, validateParams } from '../validation';

function createMockReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  it('calls next() when body is valid', () => {
    const req = createMockReq({ body: { name: 'Alice', age: 30 } });
    const res = createMockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets parsed data on req.body', () => {
    const req = createMockReq({ body: { name: 'Alice', age: 30 } });
    const res = createMockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns 400 when body is invalid', () => {
    const req = createMockReq({ body: { name: '', age: -1 } });
    const res = createMockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
        ]),
      })
    );
  });

  it('returns 400 when body is missing required fields', () => {
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    const next = vi.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('validateParams', () => {
  const schema = z.object({
    id: z.string().min(1),
  });

  it('calls next() when params are valid', () => {
    const req = createMockReq({ params: { id: 'abc123' } });
    const res = createMockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets parsed data on req.params', () => {
    const req = createMockReq({ params: { id: 'abc123' } });
    const res = createMockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(req.params).toEqual({ id: 'abc123' });
  });

  it('returns 400 when params are invalid', () => {
    const req = createMockReq({ params: { id: '' } });
    const res = createMockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
        ]),
      })
    );
  });

  it('returns 400 when params are missing', () => {
    const req = createMockReq({ params: {} });
    const res = createMockRes();
    const next = vi.fn();

    validateParams(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
