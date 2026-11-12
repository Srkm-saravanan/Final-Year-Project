import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import type { CanonicalRole } from '../types/express.js';
import { ACCESS_COOKIE_NAME, verifyAccessToken } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';

function extractAccessToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractAccessToken(req);
  if (!token) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    return;
  }

  let decoded: ReturnType<typeof verifyAccessToken>;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    sendError(res, 401, 'INVALID_TOKEN', 'Access token is invalid or expired.');
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Authenticated user account no longer exists.');
      return;
    }

    if (user.status === 'Suspended') {
      sendError(res, 403, 'ACCOUNT_SUSPENDED', 'User account is suspended.');
      return;
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name as CanonicalRole,
      status: user.status,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
    next();
  } catch (err) {
    next(err);
  }
}

