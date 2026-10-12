import { expect } from 'chai';
import type { Knex } from 'knex';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { loadEnvironment } from '../../src/config/environment.js';
import { createDatabase, createDatabaseProbe } from '../../src/database/connection.js';
import { createLogger } from '../../src/logging/logger.js';
import { createAuthRouter } from '../../src/modules/auth/auth.routes.js';
import { digest, totp } from '../../src/security/auth-crypto.js';

describe('authentication and authorization integration', () => {
  const environment = loadEnvironment();
  const delivered = { reset: '', invitation: '' };
  let database: Knex;
  let app: ReturnType<typeof createApp>;
  let customerId = '';
  let customerAccess = '';
  let ownerAccess = '';
  let ownerRecoveryCode = '';

  before(() => {
    database = createDatabase(environment.databaseUrl);
    const authRouter = createAuthRouter(database, environment, {
      async passwordReset(_email, token) { delivered.reset = token; },
      async staffInvitation(_email, token) { delivered.invitation = token; }
    });
    app = createApp({ environment, logger: createLogger('silent'), databaseProbe: createDatabaseProbe(database), apiRouter: authRouter });
  });
  after(async () => database.destroy());

  it('registers customers while rejecting role injection', async () => {
    const rejected = await request(app).post('/api/v1/auth/register').send({ email: 'bad-role@example.test', displayName: 'Bad Role', password: 'Strong password 1!', role: 'owner' });
    expect(rejected.status).to.equal(400);
    const created = await request(app).post('/api/v1/auth/register').send({ email: 'customer-a@example.test', displayName: 'Customer A', password: 'Strong password 1!' });
    expect(created.status).to.equal(201); expect(created.body.user.role).to.equal('customer'); customerId = created.body.user.id;
  });

  it('returns generic login errors and authenticates an active customer', async () => {
    const invalid = await request(app).post('/api/v1/auth/login').send({ email: 'customer-a@example.test', password: 'Wrong password!' });
    expect(invalid.status).to.equal(401); expect(invalid.body.error.message).to.equal('Email or password is invalid.');
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer-a@example.test', password: 'Strong password 1!' });
    expect(login.status).to.equal(200); customerAccess = login.body.accessToken;
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customerAccess}`);
    expect(me.status).to.equal(200); expect(me.body.user.id).to.equal(customerId);
  });

  it('conceals another customer resource', async () => {
    const second = await request(app).post('/api/v1/auth/register').send({ email: 'customer-b@example.test', displayName: 'Customer B', password: 'Strong password 2!' });
    const response = await request(app).get(`/api/v1/users/${second.body.user.id}`).set('Authorization', `Bearer ${customerAccess}`);
    expect(response.status).to.equal(404);
  });

  it('rotates refresh credentials and rejects reuse', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer-a@example.test', password: 'Strong password 1!' });
    const originalCookies = login.headers['set-cookie'] as unknown as string[];
    const csrf = /csrf_token=([^;]+)/.exec(originalCookies.join(';'))?.[1]; expect(csrf).to.be.a('string');
    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookies).set('x-csrf-token', decodeURIComponent(csrf!));
    expect(rotated.status).to.equal(200); expect(rotated.headers['set-cookie']).to.have.length(2);
    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookies).set('x-csrf-token', decodeURIComponent(csrf!));
    expect(reused.status).to.equal(401); expect(reused.body.error.code).to.equal('REFRESH_REUSED');
  });

  it('bootstraps the owner once and completes mandatory MFA', async () => {
    const bootstrap = await request(app).post('/api/v1/auth/bootstrap-owner').send({ email: 'owner@example.test', displayName: 'Owner', password: 'Owner password 1!', bootstrapToken: environment.ownerBootstrapToken });
    expect(bootstrap.status).to.equal(201);
    const enroll = await request(app).post('/api/v1/auth/mfa/enroll').send({ token: bootstrap.body.mfaToken }); expect(enroll.status).to.equal(200);
    const verified = await request(app).post('/api/v1/auth/mfa/verify').send({ token: bootstrap.body.mfaToken, code: totp(String(enroll.body.secret)) });
    expect(verified.status).to.equal(200); expect(verified.body.recoveryCodes).to.have.length(8); ownerAccess = verified.body.accessToken; ownerRecoveryCode = String(verified.body.recoveryCodes[0]);
    const reused = await request(app).post('/api/v1/auth/bootstrap-owner').send({ email: 'other-owner@example.test', displayName: 'Other', password: 'Owner password 2!', bootstrapToken: environment.ownerBootstrapToken });
    expect(reused.status).to.equal(409);
  });

  it('allows each MFA recovery code only once', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'owner@example.test', password: 'Owner password 1!' });
    const recovered = await request(app).post('/api/v1/auth/mfa/verify').send({ token: login.body.mfaToken, recoveryCode: ownerRecoveryCode }); expect(recovered.status).to.equal(200);
    const reused = await request(app).post('/api/v1/auth/mfa/verify').send({ token: login.body.mfaToken, recoveryCode: ownerRecoveryCode }); expect(reused.status).to.equal(401);
  });

  it('enforces owner-only provisioning and revokes disabled-user access', async () => {
    const forbidden = await request(app).post('/api/v1/staff/invitations').set('Authorization', `Bearer ${customerAccess}`).send({ email: 'cleaner@example.test', role: 'cleaner' }); expect(forbidden.status).to.equal(403);
    const invited = await request(app).post('/api/v1/staff/invitations').set('Authorization', `Bearer ${ownerAccess}`).send({ email: 'cleaner@example.test', role: 'cleaner' }); expect(invited.status).to.equal(201); expect(delivered.invitation).not.to.equal('');
    const accepted = await request(app).post('/api/v1/auth/staff-invitations/accept').send({ token: delivered.invitation, displayName: 'Cleaner', password: 'Cleaner password 1!' }); expect(accepted.status).to.equal(201); expect(accepted.body.user.role).to.equal('cleaner');
    const disabled = await request(app).patch(`/api/v1/users/${customerId}/security`).set('Authorization', `Bearer ${ownerAccess}`).send({ status: 'disabled', reason: 'integration test' }); expect(disabled.status).to.equal(204);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${customerAccess}`); expect(me.status).to.equal(401);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'customer-a@example.test', password: 'Strong password 1!' }); expect(login.status).to.equal(401);
  });

  it('uses single-use password resets and revokes sessions', async () => {
    const requested = await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'customer-a@example.test' }); expect(requested.status).to.equal(202); expect(delivered.reset).not.to.equal('');
    const completed = await request(app).post('/api/v1/auth/password-reset/complete').send({ token: delivered.reset, password: 'New strong password 1!' }); expect(completed.status).to.equal(204);
    const reused = await request(app).post('/api/v1/auth/password-reset/complete').send({ token: delivered.reset, password: 'Another password 1!' }); expect(reused.status).to.equal(400);
    await request(app).post('/api/v1/auth/password-reset/request').send({ email: 'customer-a@example.test' });
    await database('password_reset_tokens').where({ token_hash: digest(delivered.reset) }).update({ expires_at: new Date(0) });
    const expired = await request(app).post('/api/v1/auth/password-reset/complete').send({ token: delivered.reset, password: 'Another password 1!' }); expect(expired.status).to.equal(400);
  });

  it('commits audit records with changes and rejects audit mutation', async () => {
    const count = await database('audit_events').count<{ count: number }[]>({ count: '*' }); expect(Number(count[0]?.count)).to.be.greaterThan(3);
    let updateDenied = false; try { await database('audit_events').update({ action: 'tampered' }); } catch { updateDenied = true; } expect(updateDenied).to.equal(true);
    let deleteDenied = false; try { await database('audit_events').delete(); } catch { deleteDenied = true; } expect(deleteDenied).to.equal(true);
  });
});
