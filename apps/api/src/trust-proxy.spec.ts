import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it('is off unless configured', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
  });

  it('accepts a hop count or an address list', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
    expect(parseTrustProxy('loopback, uniquelocal')).toBe('loopback, uniquelocal');
  });

  it('refuses "true", which would let any client spoof its IP', () => {
    expect(() => parseTrustProxy('true')).toThrow(/spoof/);
  });
});
