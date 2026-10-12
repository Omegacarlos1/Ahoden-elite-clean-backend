import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from './errors.js';
import { getRequestId } from './request-id.js';
import { safeErrorForLog } from '../logging/logger.js';

interface JsonParseError extends SyntaxError {
  status?: number;
  type?: string;
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${request.method} ${request.path} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next;
  const requestId = getRequestId(request);

  if (isMalformedJsonError(error)) {
    response.status(400).json({
      error: {
        code: 'MALFORMED_JSON',
        message: 'Request body contains malformed JSON.'
      },
      requestId
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      },
      requestId
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      },
      requestId
    });
    return;
  }

  request.log?.error({ error: safeErrorForLog(error), requestId }, 'Unhandled request error');
  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.'
    },
    requestId
  });
};

function isMalformedJsonError(error: unknown): error is JsonParseError {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const candidate = error as JsonParseError;
  return candidate.status === 400 && candidate.type === 'entity.parse.failed';
}

