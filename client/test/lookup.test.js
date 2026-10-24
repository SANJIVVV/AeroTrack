import { describe, expect, it } from 'vitest';
import { trustedOrigins } from '../js/components/lookup.js';
import { parseLookupInput } from '/shared/index.js';

describe('lookup input', () => {
  it('always trusts the current site and adds configured public URLs', () => {
    window.AEROTRACK_PUBLIC_URL = 'https://aerotrack.example, https://www.aerotrack.example';
    expect(trustedOrigins()).toEqual([window.location.origin, 'https://aerotrack.example', 'https://www.aerotrack.example']);
    window.AEROTRACK_PUBLIC_URL = '';
  });

  it('accepts QR payloads, typed IDs and tracking links from trusted origins only', () => {
    const origins = ['https://aerotrack.example'];
    expect(parseLookupInput('AEROTRACK:BAG:AT-2026-100245', origins)).toMatchObject({ ok: true, reference: 'AT-2026-100245' });
    expect(parseLookupInput(' at-2026-100245 ', origins)).toMatchObject({ ok: true, reference: 'AT-2026-100245' });
    expect(parseLookupInput('https://aerotrack.example/track/AT-2026-100245', origins)).toMatchObject({ ok: true });
    expect(parseLookupInput('https://evil.example/track/AT-2026-100245', origins)).toMatchObject({ ok: false, reason: 'UNTRUSTED_URL' });
  });
});
