import { describe, it, expect } from 'vitest';
import { typeToPrefKey, isMuted, isPrefEnabled } from '@/lib/notifications/prefs';

describe('typeToPrefKey', () => {
  it('normalizes the two overdue notification types to one key', () => {
    expect(typeToPrefKey('overdue_tasks')).toBe('task_overdue');
    expect(typeToPrefKey('task_overdue')).toBe('task_overdue');
  });

  it('maps stage_changed to the lead_stage_changed pref', () => {
    expect(typeToPrefKey('stage_changed')).toBe('lead_stage_changed');
  });

  it('folds lead_assigned into lead_reassigned', () => {
    expect(typeToPrefKey('lead_assigned')).toBe('lead_reassigned');
    expect(typeToPrefKey('lead_reassigned')).toBe('lead_reassigned');
  });

  it('returns null for unknown types', () => {
    expect(typeToPrefKey('something_else')).toBeNull();
  });
});

describe('isMuted', () => {
  it('mutes a mutable type when its pref is explicitly disabled', () => {
    expect(isMuted('meeting_booked', { meeting_booked: false })).toBe(true);
  });

  it('does not mute when the pref is enabled or unset', () => {
    expect(isMuted('meeting_booked', { meeting_booked: true })).toBe(false);
    expect(isMuted('meeting_booked', {})).toBe(false);
  });

  it('never mutes always-on events even when disabled', () => {
    expect(isMuted('reminder_due', { reminder_due: false })).toBe(false);
    expect(isMuted('lead_reassigned', { lead_reassigned: false })).toBe(false);
    // lead_assigned maps to the always-on lead_reassigned key
    expect(isMuted('lead_assigned', { lead_reassigned: false })).toBe(false);
  });

  it('never mutes unknown notification types (fail open)', () => {
    expect(isMuted('mystery_type', { mystery_type: false })).toBe(false);
  });

  it('mutes the overdue alias via the shared key', () => {
    expect(isMuted('overdue_tasks', { task_overdue: false })).toBe(true);
  });
});

describe('isPrefEnabled', () => {
  it('is enabled unless explicitly false', () => {
    expect(isPrefEnabled({}, 'task_overdue')).toBe(true);
    expect(isPrefEnabled({ task_overdue: true }, 'task_overdue')).toBe(true);
    expect(isPrefEnabled({ task_overdue: false }, 'task_overdue')).toBe(false);
  });
});
