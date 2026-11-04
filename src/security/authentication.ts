import type { Request } from 'express';
import type { Knex } from 'knex';

import type { Environment } from '../config/environment.js';
import { AppError } from '../http/errors.js';
import { verifyToken } from './auth-crypto.js';

export type Role = 'customer' | 'cleaner' | 'manager' | 'admin' | 'owner';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled' | 'mfa_pending';
}

export interface Authenticator {
  requireUser(request: Request): Promise<AuthenticatedUser>;
  requireOwner(request: Request): Promise<AuthenticatedUser>;
  requireCustomer(request: Request): Promise<AuthenticatedUser>;
  requireManagerOrOwner(request: Request): Promise<AuthenticatedUser>;
}

function bearerToken(request: Request): string | undefined {
  const value = request.header('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}

export function createAuthenticator(database: Knex, environment: Environment): Authenticator {
  const requireUser = async (request: Request): Promise<AuthenticatedUser> => {
    const token = bearerToken(request);
    const claims =
      token === undefined
        ? undefined
        : verifyToken(token, environment.accessTokenSecret, 'access');
    if (claims === undefined) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const user = await database<AuthenticatedUser>('users')
      .select('id', 'email', 'role', 'status')
      .where({ id: claims.sub })
      .first();
    if (user === undefined || user.status !== 'active' || user.role !== claims.role) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    return user;
  };

  return {
    requireUser,
    async requireOwner(request) {
      const actor = await requireUser(request);
      if (actor.role !== 'owner') {
        throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
      }
      return actor;
    },
    async requireCustomer(request) {
      const actor = await requireUser(request);
      if (actor.role !== 'customer') {
        throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
      }
      return actor;
    },
    async requireManagerOrOwner(request) {
      const actor = await requireUser(request);
      if (actor.role !== 'manager' && actor.role !== 'owner') {
        throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.');
      }
      return actor;
    }
  };
}
