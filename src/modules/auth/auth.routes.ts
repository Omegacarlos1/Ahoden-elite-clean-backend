import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';

import type { Environment } from '../../config/environment.js';
import { AppError } from '../../http/errors.js';
import { getRequestId } from '../../http/request-id.js';
import { createRateLimit } from '../../http/rate-limit.js';
import { createTotpSecret, decryptSecret, digest, encryptSecret, hashPassword, randomToken, signToken, verifyPassword, verifyToken, verifyTotp } from '../../security/auth-crypto.js';

type Role = 'customer' | 'cleaner' | 'manager' | 'admin' | 'owner';
interface UserRow { id: string; email: string; display_name: string; password_hash: string; role: Role; status: 'active' | 'disabled' | 'mfa_pending'; mfa_secret_encrypted: string | null; mfa_verified_at: Date | null; }
interface SessionRow { id: string; family_id: string; user_id: string; refresh_token_hash: string; csrf_token_hash: string; expires_at: Date; used_at: Date | null; revoked_at: Date | null; }
interface Delivery { passwordReset(email: string, token: string): Promise<void>; staffInvitation(email: string, token: string): Promise<void>; }
export const noOpDelivery: Delivery = { async passwordReset() {}, async staffInvitation() {} };

const credentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128) }).strict();
const registerSchema = credentialsSchema.extend({ displayName: z.string().trim().min(2).max(120) }).strict();
const bootstrapSchema = registerSchema.extend({ bootstrapToken: z.string().min(24) }).strict();
const mfaSchema = z.object({ token: z.string().min(20), code: z.string().regex(/^\d{6}$/).optional(), recoveryCode: z.string().min(8).optional() }).strict().refine((v) => v.code !== undefined || v.recoveryCode !== undefined);

function publicUser(user: UserRow) { return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, status: user.status, mfaEnabled: user.mfa_verified_at !== null }; }
function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function bearer(request: Request): string | undefined { const value = request.header('authorization'); return value?.startsWith('Bearer ') ? value.slice(7) : undefined; }
function cookies(request: Request): Record<string, string> { return Object.fromEntries((request.header('cookie') ?? '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2) as [string, string][]); }
function setAuthCookies(response: Response, refresh: string, csrf: string, env: Environment): void {
  const common = `Max-Age=${env.refreshTokenTtlDays * 86400}; Path=/api/v1/auth; SameSite=Lax${env.nodeEnv === 'production' ? '; Secure' : ''}`;
  response.append('Set-Cookie', `refresh_token=${encodeURIComponent(refresh)}; HttpOnly; ${common}`);
  response.append('Set-Cookie', `csrf_token=${encodeURIComponent(csrf)}; ${common}`);
}
function clearAuthCookies(response: Response, env: Environment): void { const suffix = `Path=/api/v1/auth; Max-Age=0; SameSite=Lax${env.nodeEnv === 'production' ? '; Secure' : ''}`; response.append('Set-Cookie', `refresh_token=; HttpOnly; ${suffix}`); response.append('Set-Cookie', `csrf_token=; ${suffix}`); }
async function audit(tx: Knex.Transaction, request: Request, action: string, entityType: string, entityId: string, actor?: string, before?: unknown, after?: unknown, reason?: string): Promise<void> {
  await tx('audit_events').insert({ actor_user_id: actor ?? null, action, entity_type: entityType, entity_id: entityId, before_state: before === undefined ? null : JSON.stringify(before), after_state: after === undefined ? null : JSON.stringify(after), reason: reason ?? null, request_id: getRequestId(request) });
}

export function createAuthRouter(database: Knex, environment: Environment, delivery: Delivery = noOpDelivery): Router {
  const router = Router();
  const sensitiveLimit = createRateLimit(20, 15 * 60_000);
  const requireUser = async (request: Request): Promise<UserRow> => {
    const token = bearer(request); const claims = token === undefined ? undefined : verifyToken(token, environment.accessTokenSecret, 'access');
    if (claims === undefined) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    const user = await database<UserRow>('users').where({ id: claims.sub }).first();
    if (user === undefined || user.status !== 'active' || user.role !== claims.role) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
    return user;
  };
  const requireOwner = async (request: Request): Promise<UserRow> => { const user = await requireUser(request); if (user.role !== 'owner') throw new AppError(403, 'FORBIDDEN', 'This action is not permitted.'); return user; };
  const issueSession = async (user: UserRow, familyId = randomUUID()): Promise<{ accessToken: string; refresh: string; csrf: string }> => {
    const refresh = randomToken(); const csrf = randomToken(24);
    await database('auth_sessions').insert({ id: randomUUID(), family_id: familyId, user_id: user.id, refresh_token_hash: digest(refresh), csrf_token_hash: digest(csrf), expires_at: new Date(Date.now() + environment.refreshTokenTtlDays * 86_400_000) });
    return { accessToken: signToken({ sub: user.id, role: user.role, purpose: 'access' }, environment.accessTokenSecret, environment.accessTokenTtlSeconds), refresh, csrf };
  };

  router.post('/auth/register', sensitiveLimit, async (request, response, next) => { try {
    const body = registerSchema.parse(request.body); const id = randomUUID();
    try { await database.transaction(async (tx) => { await tx('users').insert({ id, email: normalizeEmail(body.email), display_name: body.displayName, password_hash: await hashPassword(body.password), role: 'customer', status: 'active' }); await audit(tx, request, 'customer.registered', 'user', id, undefined, undefined, { role: 'customer' }); }); }
    catch (error: unknown) { if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email.'); throw error; }
    const user = await database<UserRow>('users').where({ id }).first(); response.status(201).json({ user: publicUser(user!) });
  } catch (error) { next(error); } });

  router.post('/auth/bootstrap-owner', sensitiveLimit, async (request, response, next) => { try {
    const body = bootstrapSchema.parse(request.body); if (digest(body.bootstrapToken) !== digest(environment.ownerBootstrapToken)) throw new AppError(403, 'BOOTSTRAP_DENIED', 'Owner bootstrap is unavailable.');
    const id = randomUUID();
    await database.transaction(async (tx) => { const used: unknown = await tx('owner_bootstrap').where({ singleton_id: 1 }).forUpdate().first(); if (used !== undefined) throw new AppError(409, 'BOOTSTRAP_USED', 'Owner bootstrap has already been completed.'); await tx('users').insert({ id, email: normalizeEmail(body.email), display_name: body.displayName, password_hash: await hashPassword(body.password), role: 'owner', status: 'mfa_pending' }); await tx('owner_bootstrap').insert({ singleton_id: 1, owner_user_id: id }); await audit(tx, request, 'owner.bootstrapped', 'user', id, id, undefined, { role: 'owner', status: 'mfa_pending' }); });
    const mfaToken = signToken({ sub: id, role: 'owner', purpose: 'mfa' }, environment.accessTokenSecret, 600); response.status(201).json({ mfaRequired: true, mfaToken });
  } catch (error) { next(error); } });

  router.post('/auth/login', sensitiveLimit, async (request, response, next) => { try {
    const body = credentialsSchema.parse(request.body); const user = await database<UserRow>('users').where({ email: normalizeEmail(body.email) }).first();
    if (user === undefined || !(await verifyPassword(body.password, user.password_hash)) || user.status === 'disabled') throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is invalid.');
    if (['owner', 'admin'].includes(user.role)) { response.json({ mfaRequired: true, mfaSetupRequired: user.mfa_verified_at === null, mfaToken: signToken({ sub: user.id, role: user.role, purpose: 'mfa' }, environment.accessTokenSecret, 600) }); return; }
    const session = await issueSession(user); setAuthCookies(response, session.refresh, session.csrf, environment); response.json({ accessToken: session.accessToken, expiresIn: environment.accessTokenTtlSeconds, user: publicUser(user) });
  } catch (error) { next(error); } });

  router.post('/auth/mfa/enroll', async (request, response, next) => { try {
    const token = z.object({ token: z.string() }).strict().parse(request.body).token; const claims = verifyToken(token, environment.accessTokenSecret, 'mfa'); if (claims === undefined) throw new AppError(401, 'INVALID_MFA_TOKEN', 'MFA token is invalid or expired.');
    const user = await database<UserRow>('users').where({ id: claims.sub }).first(); if (user === undefined || !['owner', 'admin'].includes(user.role) || user.mfa_verified_at !== null) throw new AppError(409, 'MFA_ENROLLMENT_UNAVAILABLE', 'MFA enrollment is unavailable.');
    const secret = createTotpSecret(); await database('users').where({ id: user.id }).update({ mfa_secret_encrypted: encryptSecret(secret, environment.mfaEncryptionKey) }); response.json({ secret, otpauthUri: `otpauth://totp/Ahoden:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Ahoden` });
  } catch (error) { next(error); } });

  router.post('/auth/mfa/verify', async (request, response, next) => { try {
    const body = mfaSchema.parse(request.body); const claims = verifyToken(body.token, environment.accessTokenSecret, 'mfa'); if (claims === undefined) throw new AppError(401, 'INVALID_MFA_TOKEN', 'MFA token is invalid or expired.');
    const user = await database<UserRow>('users').where({ id: claims.sub }).first(); if (user === undefined || user.status === 'disabled' || user.mfa_secret_encrypted === null) throw new AppError(401, 'INVALID_MFA_CODE', 'MFA code is invalid.');
    let valid = body.code !== undefined && verifyTotp(decryptSecret(user.mfa_secret_encrypted, environment.mfaEncryptionKey), body.code);
    if (!valid && body.recoveryCode !== undefined) { const hash = digest(body.recoveryCode); const changed = await database('mfa_recovery_codes').where({ user_id: user.id, code_hash: hash }).whereNull('used_at').update({ used_at: database.fn.now() }); valid = changed === 1; }
    if (!valid) throw new AppError(401, 'INVALID_MFA_CODE', 'MFA code is invalid.');
    let recoveryCodes: string[] | undefined;
    if (user.mfa_verified_at === null) { recoveryCodes = Array.from({ length: 8 }, () => randomToken(9)); await database.transaction(async (tx) => { await tx('users').where({ id: user.id }).update({ status: 'active', mfa_verified_at: tx.fn.now() }); await tx('mfa_recovery_codes').insert(recoveryCodes!.map((code) => ({ id: randomUUID(), user_id: user.id, code_hash: digest(code) }))); await audit(tx, request, 'mfa.enabled', 'user', user.id, user.id); }); user.status = 'active'; user.mfa_verified_at = new Date(); }
    const session = await issueSession(user); setAuthCookies(response, session.refresh, session.csrf, environment); response.json({ accessToken: session.accessToken, expiresIn: environment.accessTokenTtlSeconds, user: publicUser(user), ...(recoveryCodes === undefined ? {} : { recoveryCodes }) });
  } catch (error) { next(error); } });

  router.post('/auth/refresh', async (request, response, next) => { try {
    const jar = cookies(request); const refresh = jar.refresh_token; const csrf = jar.csrf_token; if (refresh === undefined || csrf === undefined || request.header('x-csrf-token') !== csrf) throw new AppError(401, 'INVALID_REFRESH', 'Refresh session is invalid.');
    const hash = digest(refresh); let issued: { accessToken: string; refresh: string; csrf: string } | undefined; let reuseDetected = false;
    await database.transaction(async (tx) => { const session = await tx<SessionRow>('auth_sessions').where({ refresh_token_hash: hash }).forUpdate().first(); if (session === undefined || session.csrf_token_hash !== digest(csrf)) throw new AppError(401, 'INVALID_REFRESH', 'Refresh session is invalid.'); if (session.used_at !== null) { await tx('auth_sessions').where({ family_id: session.family_id }).update({ revoked_at: tx.fn.now() }); await audit(tx, request, 'session.reuse_detected', 'session_family', session.family_id, session.user_id); reuseDetected = true; return; } if (session.revoked_at !== null || session.expires_at <= new Date()) throw new AppError(401, 'INVALID_REFRESH', 'Refresh session is invalid.'); const user = await tx<UserRow>('users').where({ id: session.user_id }).first(); if (user === undefined || user.status !== 'active') throw new AppError(401, 'INVALID_REFRESH', 'Refresh session is invalid.'); const replacementId = randomUUID(); const nextRefresh = randomToken(); const nextCsrf = randomToken(24); await tx('auth_sessions').where({ id: session.id }).update({ used_at: tx.fn.now(), replaced_by_id: replacementId }); await tx('auth_sessions').insert({ id: replacementId, family_id: session.family_id, user_id: user.id, refresh_token_hash: digest(nextRefresh), csrf_token_hash: digest(nextCsrf), expires_at: new Date(Date.now() + environment.refreshTokenTtlDays * 86_400_000) }); issued = { accessToken: signToken({ sub: user.id, role: user.role, purpose: 'access' }, environment.accessTokenSecret, environment.accessTokenTtlSeconds), refresh: nextRefresh, csrf: nextCsrf }; });
    if (reuseDetected) throw new AppError(401, 'REFRESH_REUSED', 'Refresh session reuse was detected.');
    setAuthCookies(response, issued!.refresh, issued!.csrf, environment); response.json({ accessToken: issued!.accessToken, expiresIn: environment.accessTokenTtlSeconds });
  } catch (error) { next(error); } });

  router.post('/auth/logout', async (request, response, next) => { try { const jar = cookies(request); if (jar.refresh_token !== undefined) { if (jar.csrf_token === undefined || request.header('x-csrf-token') !== jar.csrf_token) throw new AppError(403, 'CSRF_INVALID', 'CSRF validation failed.'); await database('auth_sessions').where({ refresh_token_hash: digest(jar.refresh_token) }).update({ revoked_at: database.fn.now() }); } clearAuthCookies(response, environment); response.status(204).send(); } catch (error) { next(error); } });

  router.post('/auth/password-reset/request', sensitiveLimit, async (request, response, next) => { try { const email = normalizeEmail(z.object({ email: z.string().email() }).strict().parse(request.body).email); const user = await database<UserRow>('users').where({ email }).first(); if (user !== undefined) { const token = randomToken(); await database('password_reset_tokens').insert({ id: randomUUID(), user_id: user.id, token_hash: digest(token), expires_at: new Date(Date.now() + 30 * 60_000) }); await delivery.passwordReset(email, token); } response.status(202).json({ message: 'If the account exists, reset instructions will be sent.' }); } catch (error) { next(error); } });
  router.post('/auth/password-reset/complete', async (request, response, next) => { try { const body = z.object({ token: z.string().min(20), password: z.string().min(12).max(128) }).strict().parse(request.body); await database.transaction(async (tx) => { const reset = await tx<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>('password_reset_tokens').where('token_hash', digest(body.token)).forUpdate().first(); if (reset === undefined || reset.used_at !== null || reset.expires_at <= new Date()) throw new AppError(400, 'INVALID_RESET_TOKEN', 'Reset token is invalid or expired.'); await tx('users').where({ id: reset.user_id }).update({ password_hash: await hashPassword(body.password), updated_at: tx.fn.now() }); await tx('password_reset_tokens').where({ id: reset.id }).update({ used_at: tx.fn.now() }); await tx('auth_sessions').where({ user_id: reset.user_id }).whereNull('revoked_at').update({ revoked_at: tx.fn.now() }); await audit(tx, request, 'password.reset', 'user', reset.user_id, reset.user_id); }); response.status(204).send(); } catch (error) { next(error); } });

  router.get('/auth/me', async (request, response, next) => { try { response.json({ user: publicUser(await requireUser(request)) }); } catch (error) { next(error); } });
  router.get('/users/:id', async (request, response, next) => { try { const actor = await requireUser(request); if (actor.id !== request.params.id && actor.role !== 'owner') throw new AppError(404, 'NOT_FOUND', 'User was not found.'); const user = await database<UserRow>('users').where({ id: request.params.id }).first(); if (user === undefined) throw new AppError(404, 'NOT_FOUND', 'User was not found.'); response.json({ user: publicUser(user) }); } catch (error) { next(error); } });

  router.post('/staff/invitations', async (request, response, next) => { try { const actor = await requireOwner(request); const body = z.object({ email: z.string().email(), role: z.enum(['cleaner', 'manager', 'admin']) }).strict().parse(request.body); const token = randomToken(); const id = randomUUID(); await database.transaction(async (tx) => { await tx('staff_invitations').insert({ id, email: normalizeEmail(body.email), role: body.role, token_hash: digest(token), invited_by: actor.id, expires_at: new Date(Date.now() + 48 * 3_600_000) }); await audit(tx, request, 'staff.invited', 'staff_invitation', id, actor.id, undefined, { email: normalizeEmail(body.email), role: body.role }); }); await delivery.staffInvitation(body.email, token); response.status(201).json({ invitation: { id, email: normalizeEmail(body.email), role: body.role } }); } catch (error) { next(error); } });
  router.post('/auth/staff-invitations/accept', async (request, response, next) => { try { const body = z.object({ token: z.string().min(20), displayName: z.string().trim().min(2).max(120), password: z.string().min(12).max(128) }).strict().parse(request.body); const id = randomUUID(); await database.transaction(async (tx) => { const invitation = await tx<{ id: string; email: string; role: Role; expires_at: Date; accepted_at: Date | null }>('staff_invitations').where('token_hash', digest(body.token)).forUpdate().first(); if (invitation === undefined || invitation.accepted_at !== null || invitation.expires_at <= new Date()) throw new AppError(400, 'INVALID_INVITATION', 'Invitation is invalid or expired.'); const status = invitation.role === 'admin' ? 'mfa_pending' : 'active'; await tx('users').insert({ id, email: invitation.email, display_name: body.displayName, password_hash: await hashPassword(body.password), role: invitation.role, status }); await tx('staff_invitations').where({ id: invitation.id }).update({ accepted_at: tx.fn.now() }); await audit(tx, request, 'staff.invitation_accepted', 'user', id, id, undefined, { role: invitation.role, status }); }); const user = await database<UserRow>('users').where({ id }).first(); response.status(201).json({ user: publicUser(user!), ...(user?.status === 'mfa_pending' ? { mfaRequired: true, mfaToken: signToken({ sub: id, role: user.role, purpose: 'mfa' }, environment.accessTokenSecret, 600) } : {}) }); } catch (error) { next(error); } });
  router.patch('/users/:id/security', async (request, response, next) => { try { const actor = await requireOwner(request); if (actor.id === request.params.id) throw new AppError(409, 'SELF_CHANGE_DENIED', 'Owner cannot change their own role or status here.'); const body = z.object({ role: z.enum(['customer', 'cleaner', 'manager', 'admin']).optional(), status: z.enum(['active', 'disabled']).optional(), reason: z.string().min(3).max(255) }).strict().refine((v) => v.role !== undefined || v.status !== undefined).parse(request.body); await database.transaction(async (tx) => { const target = await tx<UserRow>('users').where({ id: request.params.id }).forUpdate().first(); if (target === undefined || target.role === 'owner') throw new AppError(404, 'NOT_FOUND', 'User was not found.'); const changes = { ...(body.role === undefined ? {} : { role: body.role }), ...(body.status === undefined ? {} : { status: body.status }), updated_at: tx.fn.now() }; await tx('users').where({ id: target.id }).update(changes); await tx('auth_sessions').where({ user_id: target.id }).whereNull('revoked_at').update({ revoked_at: tx.fn.now() }); await audit(tx, request, 'user.security_changed', 'user', target.id, actor.id, { role: target.role, status: target.status }, { role: body.role ?? target.role, status: body.status ?? target.status }, body.reason); }); response.status(204).send(); } catch (error) { next(error); } });

  return router;
}
