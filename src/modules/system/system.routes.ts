import { Router } from 'express';

import type { DatabaseProbe } from '../../database/connection.js';
import { getRequestId } from '../../http/request-id.js';
import { safeErrorForLog } from '../../logging/logger.js';

export function createSystemRouter(databaseProbe: DatabaseProbe): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  router.get('/ready', async (request, response) => {
    try {
      await databaseProbe.check();
      response.status(200).json({ status: 'ready' });
    } catch (error) {
      request.log.warn({ error: safeErrorForLog(error) }, 'Database readiness check failed');
      response.status(503).json({
        status: 'unavailable',
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database is unavailable.'
        },
        requestId: getRequestId(request)
      });
    }
  });

  return router;
}

