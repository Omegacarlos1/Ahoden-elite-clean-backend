import { expect } from 'chai';

import { createTotpSecret, decryptSecret, encryptSecret, hashPassword, signToken, totp, verifyPassword, verifyToken, verifyTotp } from '../../src/security/auth-crypto.js';

describe('authentication cryptography', () => {
  it('hashes passwords with unique salts and verifies them', async () => {
    const first = await hashPassword('Correct Horse Battery!');
    const second = await hashPassword('Correct Horse Battery!');
    expect(first).not.to.equal(second);
    expect(await verifyPassword('Correct Horse Battery!', first)).to.equal(true);
    expect(await verifyPassword('wrong-password', first)).to.equal(false);
  });

  it('signs, scopes and rejects tampered tokens', () => {
    const token = signToken({ sub: 'user-1', role: 'customer', purpose: 'access' }, 'a-secret-that-is-long-enough-for-tests', 60);
    expect(verifyToken(token, 'a-secret-that-is-long-enough-for-tests', 'access')?.sub).to.equal('user-1');
    expect(verifyToken(token, 'a-secret-that-is-long-enough-for-tests', 'mfa')).to.equal(undefined);
    expect(verifyToken(`${token}x`, 'a-secret-that-is-long-enough-for-tests', 'access')).to.equal(undefined);
  });

  it('encrypts MFA secrets and validates a current TOTP', () => {
    const key = Buffer.alloc(32, 9).toString('base64'); const secret = createTotpSecret();
    const encrypted = encryptSecret(secret, key);
    expect(encrypted).not.to.contain(secret);
    expect(decryptSecret(encrypted, key)).to.equal(secret);
    expect(verifyTotp(secret, totp(secret))).to.equal(true);
  });
});
