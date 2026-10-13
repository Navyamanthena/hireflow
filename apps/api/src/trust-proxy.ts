/**
 * Express "trust proxy" setting from TRUST_PROXY.
 *
 * Behind nginx every request arrives from the proxy's IP, so per-IP login
 * throttling would put all users in one bucket. Trusting exactly the proxy
 * hop lets Express read the real client IP from X-Forwarded-For.
 *
 * Only enable it when the API is reachable *solely* through that proxy:
 * otherwise a client could send its own X-Forwarded-For to dodge the limit.
 *
 *   unset / "false" -> false (direct connections, the safe default)
 *   "1", "2"        -> trust that many proxy hops
 *   "true"          -> refused: trusting every hop makes the header spoofable
 *   anything else   -> passed through (e.g. "loopback, uniquelocal")
 */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '' || v === 'false' || v === '0') return false;
  if (v === 'true') {
    throw new Error('TRUST_PROXY=true trusts every hop and lets clients spoof their IP; use the hop count, e.g. 1');
  }
  if (/^\d+$/.test(v)) return Number(v);
  return value!.trim();
}
