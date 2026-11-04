import type { RequestHandler } from 'express';
import { getRequestId } from './request-id.js';

interface Bucket { count: number; resetsAt: number; }

export function createRateLimit(maximum: number, windowMilliseconds: number): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (request, response, next) => {
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const previous = buckets.get(key);
    const bucket = previous === undefined || previous.resetsAt <= now ? { count: 0, resetsAt: now + windowMilliseconds } : previous;
    bucket.count += 1; buckets.set(key, bucket);
    response.setHeader('RateLimit-Limit', maximum);
    response.setHeader('RateLimit-Remaining', Math.max(0, maximum - bucket.count));
    if (bucket.count > maximum) { response.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' }, requestId: getRequestId(request) }); return; }
    next();
  };
}
