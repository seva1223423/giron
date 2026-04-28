/**
 * Unit tests for clientVersionGate middleware (CLIENT-VERSION-01).
 *
 * Covers:
 *   - compareSemver pure function across normal, malformed, and prerelease inputs
 *   - the gate is disabled when MIN_CLIENT_VERSION is unset or "0.0.0"
 *   - 426 fires for stale clients
 *   - missing X-Client-Version is treated as "unknown" and passes through
 *     (so curl / webhooks / admin tooling never get blocked)
 *   - open paths (/health, /api/auth, /api/admin/digest/readiness) bypass
 *     the gate even when stale
 */

import { compareSemver, clientVersionGate } from '../middleware/clientVersion';
import type { Request, Response, NextFunction } from 'express';

function mockReq(opts: {
  path: string;
  headers?: Record<string, string>;
}): Request {
  const headers = opts.headers ?? {};
  return {
    path: opts.path,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function mockRes(): Response & { _status?: number; _json?: unknown } {
  const res: Response & { _status?: number; _json?: unknown } = {
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._json = body;
      return this;
    },
  } as Response & { _status?: number; _json?: unknown };
  return res;
}

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('2.5.7', '2.5.7')).toBe(0);
  });

  it('detects major version differences', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemver('3.0.0', '2.0.0')).toBe(1);
  });

  it('detects minor version differences', () => {
    expect(compareSemver('1.2.0', '1.3.0')).toBe(-1);
    expect(compareSemver('1.5.0', '1.2.0')).toBe(1);
  });

  it('detects patch version differences', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.0.5', '1.0.2')).toBe(1);
  });

  it('handles missing trailing parts ("1" → "1.0.0")', () => {
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('2.1', '2.1.0')).toBe(0);
    expect(compareSemver('1', '2')).toBe(-1);
  });

  it('strips prerelease suffixes', () => {
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3+build.7', '1.2.3')).toBe(0);
  });

  it('treats malformed segments as 0 (never throws)', () => {
    expect(compareSemver('1.x.0', '1.0.0')).toBe(0);
    expect(compareSemver('garbage', '0.0.0')).toBe(0);
    expect(compareSemver('', '1.0.0')).toBe(-1);
  });
});

describe('clientVersionGate', () => {
  const origMin = process.env.MIN_CLIENT_VERSION;
  afterEach(() => {
    if (origMin === undefined) delete process.env.MIN_CLIENT_VERSION;
    else process.env.MIN_CLIENT_VERSION = origMin;
  });

  it('passes through when MIN_CLIENT_VERSION unset', () => {
    delete process.env.MIN_CLIENT_VERSION;
    const req = mockReq({ path: '/api/workout', headers: { 'x-client-version': '0.0.1' } });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeUndefined();
  });

  it('passes through when MIN_CLIENT_VERSION = "0.0.0"', () => {
    process.env.MIN_CLIENT_VERSION = '0.0.0';
    const req = mockReq({ path: '/api/workout', headers: { 'x-client-version': '0.0.1' } });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it('returns 426 when client is below MIN_CLIENT_VERSION', () => {
    process.env.MIN_CLIENT_VERSION = '1.5.0';
    const req = mockReq({
      path: '/api/workout',
      headers: { 'x-client-version': '1.2.3', 'x-client-platform': 'android' },
    });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(426);
    expect(res._json).toMatchObject({
      code: 'CLIENT_TOO_OLD',
      clientVersion: '1.2.3',
      minVersion: '1.5.0',
      updateUrl: expect.stringContaining('rustore'),
    });
  });

  it('returns iOS link when platform=ios', () => {
    process.env.MIN_CLIENT_VERSION = '2.0.0';
    const req = mockReq({
      path: '/api/workout',
      headers: { 'x-client-version': '1.0.0', 'x-client-platform': 'ios' },
    });
    const res = mockRes();
    clientVersionGate(req, res, jest.fn() as unknown as NextFunction);
    expect(res._json).toMatchObject({ updateUrl: expect.stringContaining('apps.apple.com') });
  });

  it('passes through when X-Client-Version missing (curl/webhook callers)', () => {
    process.env.MIN_CLIENT_VERSION = '1.5.0';
    const req = mockReq({ path: '/api/workout', headers: {} });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeUndefined();
  });

  it('passes through current version', () => {
    process.env.MIN_CLIENT_VERSION = '1.5.0';
    const req = mockReq({ path: '/api/workout', headers: { 'x-client-version': '1.5.0' } });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it('passes through newer client', () => {
    process.env.MIN_CLIENT_VERSION = '1.5.0';
    const req = mockReq({ path: '/api/workout', headers: { 'x-client-version': '2.0.0' } });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
  });

  it.each([
    '/health',
    '/health/ready',
    '/api/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/admin/digest/readiness',
  ])('bypasses gate for open path %s even when stale', (path) => {
    process.env.MIN_CLIENT_VERSION = '99.0.0';
    const req = mockReq({ path, headers: { 'x-client-version': '0.1.0' } });
    const res = mockRes();
    const next = jest.fn();
    clientVersionGate(req, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeUndefined();
  });
});
