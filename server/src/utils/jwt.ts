import crypto from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export const ACCESS_COOKIE_NAME = 'cortex_access_token';
export const REFRESH_COOKIE_NAME = 'cortex_refresh_token';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function parseDurationMs(spec: string, fallbackMs: number): number {
  const match = /^(\d+)([smhd])$/i.exec(spec.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload &
    Partial<AccessTokenPayload>;
  if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid access token payload');
  }
  return {
    sub: decoded.sub,
    email: String(decoded.email ?? ''),
    role: String(decoded.role ?? ''),
    type: 'access',
  };
}

export function signRefreshToken(userId: string): { token: string; jti: string; expiresAt: Date } {
  const jti = crypto.randomUUID();
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    options
  );
  const ttlMs = parseDurationMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);
  const expiresAt = new Date(Date.now() + ttlMs);
  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload &
    Partial<RefreshTokenPayload>;
  if (
    decoded.type !== 'refresh' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.jti !== 'string'
  ) {
    throw new Error('Invalid refresh token payload');
  }
  return {
    sub: decoded.sub,
    jti: decoded.jti,
    type: 'refresh',
  };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function getAccessCookieOptions(): CookieOptions {
  const maxAge = parseDurationMs(env.JWT_ACCESS_EXPIRES_IN, 15 * 60 * 1000);
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge,
  };
}

export function getRefreshCookieOptions(): CookieOptions {
  const maxAge = parseDurationMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/api/auth',
    maxAge,
  };
}

