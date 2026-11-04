import { createCipheriv, createDecipheriv, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
function derive(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, length, options, (error, key) => error === null ? resolve(key) : reject(error)));
}

export function randomToken(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }
export function digest(value: string): string { return createHmac('sha256', 'ahoden-auth-v1').update(value).digest('hex'); }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText] = encoded.split('$');
  if (algorithm !== 'scrypt' || saltText === undefined || keyText === undefined) return false;
  const expected = Buffer.from(keyText, 'base64');
  const actual = await derive(password, Buffer.from(saltText, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function base64url(value: Buffer | string): string { return Buffer.from(value).toString('base64url'); }

export interface AccessClaims { sub: string; role: string; purpose: 'access' | 'mfa'; exp: number; }

export function signToken(claims: Omit<AccessClaims, 'exp'>, secret: string, ttlSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ ...claims, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds, iss: 'ahoden-api', aud: 'ahoden-client' }));
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string, purpose: AccessClaims['purpose']): AccessClaims | undefined {
  const [header, payload, signature] = token.split('.');
  if (header === undefined || payload === undefined || signature === undefined) return undefined;
  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims & { iss?: string; aud?: string };
    if (claims.purpose !== purpose || claims.exp <= Date.now() / 1000 || claims.iss !== 'ahoden-api' || claims.aud !== 'ahoden-client') return undefined;
    return claims;
  } catch { return undefined; }
}

export function encryptSecret(secret: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value: string, keyBase64: string): string {
  const [iv, tag, ciphertext] = value.split('.');
  if (iv === undefined || tag === undefined || ciphertext === undefined) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function createTotpSecret(): string {
  const bytes = randomBytes(20); let bits = ''; let out = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  for (let index = 0; index < bits.length; index += 5) out += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  return out;
}
function decodeBase32(value: string): Buffer {
  let bits = ''; for (const char of value) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function totp(secret: string, time = Date.now()): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)));
  const hash = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hash[19]! & 15;
  const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}
export function verifyTotp(secret: string, code: string): boolean {
  return [-1, 0, 1].some((window) => totp(secret, Date.now() + window * 30_000) === code);
}
