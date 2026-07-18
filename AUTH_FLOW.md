# TrustLine Authentication Flow

This document describes the authentication flow implemented in TrustLine today. It distinguishes the API-backed controls from UI-only demonstrations and documents the in-repository RFC 6238 implementation.

## 1. Signup and passkey registration

1. The browser submits an email address to `POST /api/auth/register/options`.
2. The backend creates or finds the user, generates WebAuthn registration options, and stores the registration challenge in its in-memory challenge map.
3. The frontend calls the browser WebAuthn API through `@simplewebauthn/browser`.
4. The browser/platform authenticator creates a passkey and returns an attestation response.
5. `POST /api/auth/register/verify` verifies the stored challenge, configured allowed origin, and relying-party ID. It stores the credential public key and counter in PostgreSQL, then creates an Ed25519 signing key pair for approval votes.

No password is created or transmitted during this flow.

## 2. TOTP secret and QR-code enrollment

After passkey registration, the registration UI calls `POST /api/auth/totp/setup` with the newly created user ID.

1. The backend generates 20 cryptographically random bytes with Node.js `crypto.randomBytes`.
2. It encodes those bytes as unpadded RFC 4648 Base32. Base32 is the standard secret representation expected by common authenticator applications.
3. The Base32 secret is stored on the user record with `totp_enabled = false`.
4. The backend returns a standard provisioning URI:

   ```text
   otpauth://totp/TrustLine:<email>?secret=<BASE32>&issuer=TrustLine&algorithm=SHA1&digits=6&period=30
   ```

5. The frontend uses the `qrcode` package only to render that URI as a QR image. It does not generate or validate one-time passwords.
6. The user scans the QR code with a compatible authenticator, enters the first six-digit code, and the frontend submits it to `POST /api/auth/totp/verify`.
7. A valid code sets `totp_enabled = true`.

Google Authenticator, Microsoft Authenticator, Authy, Bitwarden, and 1Password support this standard `otpauth://` TOTP profile.

## 3. RFC 6238 code generation

TrustLine performs TOTP generation and validation itself in `backend/src/services/totp.service.ts`; no OTP-generation or OTP-verification package is used.

1. **Base32 decode:** the stored RFC 4648 secret is decoded into bytes.
2. **Time counter:** the current Unix time is converted into a counter with `floor(unixSeconds / 30)`. A 30-second period is the interoperable default for RFC 6238 applications.
3. **HOTP:** the service calculates HMAC-SHA1 over the counter encoded as an 8-byte big-endian integer. HMAC-SHA1 is used because RFC 4226 defines HOTP with SHA-1 and RFC 6238 explicitly permits SHA-1 as its standard profile.
4. **Dynamic truncation:** the low four bits of the final HMAC byte choose a four-byte slice. The sign bit is cleared to create a positive 31-bit integer, exactly as specified by RFC 4226.
5. **Six digits:** the integer modulo `1,000,000` yields a six-digit value; leading zeroes are retained.

The implementation exposes `generateTOTP(secret, timestamp?)` and `verifyTOTP(secret, token, window?)`. `verifyTOTP` accepts the current, previous, and next 30-second periods by default (±1 step) to tolerate normal clock drift. Candidate codes are compared with Node's `timingSafeEqual`.

## 4. Login and adaptive step-up

1. The login page obtains WebAuthn authentication options from `POST /api/auth/login/options` and invokes the platform authenticator.
2. `POST /api/auth/login/verify` verifies the assertion against the stored login challenge, credential, counter, allowed origin, and RP ID.
3. The backend compares the request IP address and user-agent to recent login events.
4. A low-risk result issues a JWT access token and a refresh token. Medium or high results issue a five-minute pending token instead.
5. The UI’s number-matching screen is a local demonstration. It is not a push notification service.
6. For a pending step-up, the user submits a current authenticator code to `POST /api/auth/login/step-up`. The backend runs its RFC 6238 verifier before issuing the session tokens.

## 5. Sessions and audit evidence

- Access JWTs have a 15-minute lifetime.
- Refresh tokens are random values stored as SHA-256 hashes, rotated within a family, and a reused token revokes its family.
- Login and risk-decision events are written to the tamper-evident audit chain.
- The Dashboard displays the signed-in user’s sessions and relevant audit activity.

## Why TrustLine does not use a third-party verification service

TOTP is a shared-secret, local protocol. A remote service is neither required nor desirable for the core verification operation: the server already owns the enrollment secret and can compute the same RFC 6238 value deterministically with Node’s built-in cryptography. QR rendering is separate from verification and remains client-side.

The implementation is standards compliant because it follows RFC 4648 Base32 encoding, RFC 4226 HMAC-SHA1 and dynamic truncation, and RFC 6238’s time-based counter with a 30-second period. The unit tests include RFC 4226 HOTP and RFC 6238 TOTP test vectors.

## Current scope

- TOTP setup and verification currently accept the registration flow's
  client-supplied `userId` without bearer authentication. This is a demo
  limitation, not a production-safe factor re-enrollment design.
- TOTP secrets are stored on the current user row. At-rest encryption of those secrets and recovery codes are future hardening work.
- WebAuthn challenges and the step-up rate limit use in-memory stores, appropriate for the local single-process demo but not a multi-instance production deployment.
- Authenticator compatibility relies on the standard six-digit, SHA-1, 30-second `otpauth://` profile.
