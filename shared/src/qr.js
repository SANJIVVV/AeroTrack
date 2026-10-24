/**
 * QR payloads carry only a non-sensitive baggage reference.
 * Passenger names, flight details and contact data are never encoded;
 * a signed-in, authorised user is needed for the backend to resolve it.
 */

export const QR_PREFIX = 'AEROTRACK:BAG:';

/** Current tag format: AT-<year>-<6 random digits>, e.g. AT-2026-100245. */
const YEAR_REFERENCE = /^AT-\d{4}-\d{6}$/;
// Earlier format (still accepted): Crockford-style alphabet without I, L, O, U.
const LEGACY_REFERENCE = /^AT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const LEGACY_ALPHABET = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export const REFERENCE_PATTERN = new RegExp(`${YEAR_REFERENCE.source}|${LEGACY_REFERENCE.source}`);

export function isReference(text) {
  return YEAR_REFERENCE.test(text) || LEGACY_REFERENCE.test(text);
}

/** New tag reference. `randomBytes` must be a cryptographic source. */
export function generateReference(randomBytes, year = new Date().getUTCFullYear()) {
  const b = randomBytes(4);
  const n = (((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0)) >>> 0;
  return `AT-${year}-${String(n % 1_000_000).padStart(6, '0')}`;
}

export function toQrPayload(reference) {
  return `${QR_PREFIX}${reference}`;
}

/** Normalise manual entry: trims, upper-cases, tolerates missing dashes and spaces. */
export function normalizeReference(input) {
  const raw = input.trim().toUpperCase().replace(/\s+/g, '');
  const year = /^AT-?(\d{4})-?(\d{6})$/.exec(raw);
  if (year) return `AT-${year[1]}-${year[2]}`;
  const compact = raw.startsWith('AT') ? raw.slice(2).replace(/-/g, '') : raw.replace(/-/g, '');
  if (!LEGACY_ALPHABET.test(compact)) return null;
  const ref = `AT-${compact.slice(0, 4)}-${compact.slice(4)}`;
  return LEGACY_REFERENCE.test(ref) ? ref : null;
}

/** Parse a scanned QR string. Returns null for anything that is not ours. */
export function parseQrPayload(payload) {
  const text = payload.trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const ref = text.slice(QR_PREFIX.length);
  return isReference(ref) ? ref : null;
}

/**
 * Turn anything a user might paste (a decoded QR payload, a plain baggage ID,
 * or a tracking link) into a reference. Links are accepted only when their
 * origin is one of `trustedOrigins`; nothing is ever opened or fetched.
 */
export function parseLookupInput(input, trustedOrigins) {
  const text = input.trim();
  if (!text) return { ok: false, reason: 'EMPTY' };
  const fromQr = parseQrPayload(text);
  if (fromQr) return { ok: true, reference: fromQr, via: 'qr-payload' };
  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: 'INVALID' };
    }
    const trusted = trustedOrigins.some((o) => {
      try {
        return new URL(o).origin === url.origin;
      } catch {
        return false;
      }
    });
    if (!trusted) return { ok: false, reason: 'UNTRUSTED_URL' };
    const m = /^\/(?:track|baggage)\/([^/?#]+)\/?$/.exec(url.pathname);
    const ref = m ? normalizeReference(decodeURIComponent(m[1])) : null;
    return ref ? { ok: true, reference: ref, via: 'url' } : { ok: false, reason: 'INVALID' };
  }
  const ref = normalizeReference(text);
  return ref ? { ok: true, reference: ref, via: 'reference' } : { ok: false, reason: 'INVALID' };
}
