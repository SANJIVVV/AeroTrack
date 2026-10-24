import { describe, expect, it } from 'vitest';
import { canMove, nextColumn } from '../js/pages/board.js';

const bag = (status, lastMainStatus = status) => ({ status, lastMainStatus });

describe('board move rules', () => {
  it('allows exactly one step forward', () => {
    expect(canMove(bag('CHECKED_IN'), 'SECURITY_SCREENING')).toEqual({ ok: true });
  });

  it('refuses skipped steps and names the missing one', () => {
    const v = canMove(bag('CHECKED_IN'), 'LOADED');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Security Screening/);
  });

  it('refuses backward moves and moves after collection', () => {
    expect(canMove(bag('LOADED'), 'CHECKED_IN').ok).toBe(false);
    expect(canMove(bag('COLLECTED'), 'ON_BELT').ok).toBe(false);
  });

  it('lets an exception resume in its last verified column', () => {
    expect(canMove(bag('DELAYED', 'LOADED'), 'LOADED')).toEqual({ ok: true });
    expect(nextColumn(bag('DELAYED', 'LOADED'))).toBe('LOADED');
  });

  it('suggests the next main step, and nothing once collected', () => {
    expect(nextColumn(bag('REGISTERED'))).toBe('CHECKED_IN');
    expect(nextColumn(bag('COLLECTED'))).toBeNull();
  });
});
