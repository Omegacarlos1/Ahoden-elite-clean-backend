import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function generateRequestId(request: IncomingMessage, response: ServerResponse): string {
  const supplied = request.headers['x-request-id'];
  const requestId =
    typeof supplied === 'string' && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
  response.setHeader('x-request-id', requestId);
  return requestId;
}

export function getRequestId(request: IncomingMessage): string {
  return typeof request.id === 'string' ? request.id : 'unknown';
}

