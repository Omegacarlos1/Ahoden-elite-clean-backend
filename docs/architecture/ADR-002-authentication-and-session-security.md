# ADR-002: Authentication and session security

- Status: accepted for M02
- Date: 2026-10-12

## Decision

Use Node.js `scrypt` password hashes with per-password random salts. Issue 15-minute HMAC-SHA256 access tokens and opaque 30-day refresh credentials. Store only HMAC digests of refresh, reset, invitation, CSRF, and recovery credentials. Rotate refresh credentials on every use; detected reuse revokes the whole session family.

Refresh credentials use an HttpOnly, SameSite=Lax cookie. A separate readable SameSite=Lax CSRF cookie must match `x-csrf-token` for refresh. Cookies are Secure in production. Browser origins are restricted by `CORS_ORIGINS`; wildcard production CORS is invalid configuration.

Owner and admin accounts require RFC 6238 TOTP. TOTP secrets are encrypted with AES-256-GCM using a separately configured key. Recovery codes are displayed once and stored only as digests. Owner bootstrap uses a high-entropy deployment secret and a locked singleton database record.

Authentication authorization reloads the user role/status from the database, so disabling or changing a role invalidates existing access-token authority immediately. Sensitive changes and audit events share one database transaction. Database triggers reject audit update/delete even though the M01 runtime principal has general table DML grants.

## Consequences

The local notification adapter deliberately sends nothing; integration tests capture invitation/reset credentials in memory. A production delivery provider remains blocked by B-005. HMAC signing requires careful secret distribution and rotation; asymmetric signing can be reconsidered when multiple independently deployed verifiers exist.
