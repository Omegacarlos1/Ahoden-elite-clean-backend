import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import type { Environment } from './config/environment.js';
import type { DatabaseProbe } from './database/connection.js';
import { errorHandler, notFoundHandler } from './http/error-handler.js';
import { generateRequestId, getRequestId } from './http/request-id.js';
import { createSystemRouter } from './modules/system/system.routes.js';

export interface ApplicationDependencies {
  environment: Environment;
  logger: Logger;
  databaseProbe: DatabaseProbe;
}

export function createApp({ environment, logger, databaseProbe }: ApplicationDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', environment.trustProxy);
  app.use(
    pinoHttp({
      logger,
      genReqId: generateRequestId,
      quietReqLogger: true,
      wrapSerializers: false,
      serializers: {
        req(request: IncomingMessage) {
          return {
            id: getRequestId(request),
            method: request.method,
            url: request.url,
            remoteAddress: request.socket.remoteAddress
          };
        },
        res(response: ServerResponse) {
          return { statusCode: response.statusCode };
        }
      }
    })
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (origin === undefined || environment.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-request-id'],
      exposedHeaders: ['x-request-id']
    })
  );
  app.use(express.json({ limit: environment.bodyLimit, strict: true }));

  app.use(createSystemRouter(databaseProbe));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

