import type { NextFunction, Request, Response } from 'express';
import type { CanonicalRole } from '../types/express.js';
import { sendError } from '../utils/response.js';

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
      return;
    }

    const userPermissions = new Set(req.user.permissions);
    const missing = requiredPermissions.filter((perm) => !userPermissions.has(perm));
    if (missing.length > 0) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied for role "${req.user.role}". Missing required permission: ${missing.join(', ')}`
      );
      return;
    }

    next();
  };
}

export function requireRole(...allowedRoles: CanonicalRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Allowed roles: ${allowedRoles.join(', ')}`
      );
      return;
    }

    next();
  };
}

