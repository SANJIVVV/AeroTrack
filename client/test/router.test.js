import { describe, expect, it } from 'vitest';
import { compile } from '../js/lib/router.js';

describe('route matching', () => {
  it('matches static paths with an optional trailing slash', () => {
    const m = compile('/track');
    expect(m('/track')).toEqual({});
    expect(m('/track/')).toEqual({});
    expect(m('/tracking')).toBeNull();
  });

  it('extracts and decodes parameters', () => {
    const m = compile('/baggage/:ref');
    expect(m('/baggage/AT-2026-100245')).toEqual({ ref: 'AT-2026-100245' });
    expect(m('/airlines/AI')).toBeNull();
    expect(compile('/airlines/:code')('/airlines/6E%20')).toEqual({ code: '6E ' });
  });

  it('does not match deeper paths', () => {
    expect(compile('/baggage/:ref')('/baggage/AT-1/extra')).toBeNull();
  });

  it('treats * as a catch-all', () => {
    expect(compile('*')('/anything/at/all')).toEqual({});
  });
});
