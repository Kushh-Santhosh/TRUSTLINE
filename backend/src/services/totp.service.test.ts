/** RFC 4226 / RFC 6238 conformance tests for the built-in TOTP implementation. */
import { describe, expect, it } from 'vitest';
import { decodeBase32, generateHOTP, generateTOTP, verifyTOTP } from './totp.service';

// ASCII "12345678901234567890", represented as RFC 4648 Base32. This is the
// shared secret used by RFC 4226 Appendix D and RFC 6238 Appendix B (SHA-1).
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('RFC 4648 Base32 decoding', () => {
  it('decodes the RFC test secret and accepts lower-case and whitespace', () => {
    expect(decodeBase32(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
    expect(decodeBase32('gez dgnbvgy3tqojqgez-dgnbvgy3tqojq').toString('ascii'))
      .toBe('12345678901234567890');
  });

  it('accepts valid RFC 4648 padding and rejects malformed padding', () => {
    expect(decodeBase32('MY======').toString('ascii')).toBe('f');
    expect(() => decodeBase32(`${RFC_SECRET}====`)).toThrow('invalid Base32 padding');
  });

  it('rejects invalid RFC 4648 characters', () => {
    expect(() => decodeBase32('NOT-A-BASE32-SECRET!')).toThrow('invalid Base32 secret');
  });
});

describe('RFC 4226 HOTP vectors', () => {
  // RFC 4226 Appendix D, counters 0 through 9, six digits, HMAC-SHA1.
  const vectors = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

  it.each(vectors.map((token, counter) => ({ counter, token })))
  ('matches counter $counter', ({ counter, token }) => {
    expect(generateHOTP(RFC_SECRET, BigInt(counter))).toBe(token);
  });
});

describe('RFC 6238 TOTP vectors', () => {
  // RFC 6238 Appendix B provides eight-digit SHA-1 results. TrustLine exposes
  // six-digit codes, so these are the rightmost six digits of each vector.
  const vectors = [
    { seconds: 59, expected: '287082' },
    { seconds: 1_111_111_109, expected: '081804' },
    { seconds: 1_111_111_111, expected: '050471' },
    { seconds: 1_234_567_890, expected: '005924' },
    { seconds: 2_000_000_000, expected: '279037' },
    { seconds: 20_000_000_000, expected: '353130' },
  ];

  it.each(vectors)('matches the SHA-1 vector at $seconds seconds', ({ seconds, expected }) => {
    expect(generateTOTP(RFC_SECRET, seconds * 1000)).toBe(expected);
  });

  it('accepts exactly the configured ±1 time-step clock-drift window', () => {
    const timestamp = 1_234_567_890_000;
    const previousStepToken = generateTOTP(RFC_SECRET, timestamp - 30_000);
    const twoStepsAwayToken = generateTOTP(RFC_SECRET, timestamp - 60_000);

    expect(verifyTOTP(RFC_SECRET, previousStepToken, 1, timestamp)).toBe(true);
    expect(verifyTOTP(RFC_SECRET, twoStepsAwayToken, 1, timestamp)).toBe(false);
  });

  it('rejects malformed codes before verification', () => {
    expect(verifyTOTP(RFC_SECRET, '12345', 1, 59_000)).toBe(false);
    expect(verifyTOTP(RFC_SECRET, 'abcdef', 1, 59_000)).toBe(false);
  });
});
