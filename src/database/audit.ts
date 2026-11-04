import type { Request } from 'express';
import type { Knex } from 'knex';

import { getRequestId } from '../http/request-id.js';

export interface AuditEventInput {
  action: string;
  entityType: string;
  entityId: string;
  actorUserId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export async function appendAuditEvent(
  transaction: Knex.Transaction,
  request: Request,
  input: AuditEventInput
): Promise<void> {
  await transaction('audit_events').insert({
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    before_state: input.before === undefined ? null : JSON.stringify(input.before),
    after_state: input.after === undefined ? null : JSON.stringify(input.after),
    reason: input.reason ?? null,
    request_id: getRequestId(request)
  });
}
