import { describe, expect, it } from 'vitest';
import { formatRelative, homeFor, pct, titleCase } from '../js/lib/format.js';

describe('format helpers', () => {
  it('titleCase turns enum values into labels', () => {
    expect(titleCase('MISSING_CHECKPOINT')).toBe('Missing Checkpoint');
    expect(titleCase('passenger')).toBe('Passenger');
  });

  it('pct rounds to a whole percent', () => {
    expect(pct(0.256)).toBe('26%');
  });

  it('homeFor sends each role to its dashboard', () => {
    expect(homeFor('admin')).toBe('/admin');
    expect(homeFor('staff')).toBe('/staff');
    expect(homeFor('passenger')).toBe('/dashboard');
  });

  it('formatRelative describes recent times', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(formatRelative('2026-10-24T11:58:00Z', now)).toMatch(/2 min/);
    expect(formatRelative(null, now)).toBeTruthy();
  });
});
