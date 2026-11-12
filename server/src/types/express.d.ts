export type CanonicalRole = 'Admin' | 'Analyst' | 'Executive' | 'Viewer';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: CanonicalRole;
  status: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

