import { describe, it, expect } from 'vitest';
import { nextBusinessDay, snapToBusinessDay, isWeekend } from '@/lib/dates/businessDays';

describe('nextBusinessDay', () => {
  it('Friday → Monday 09:00', () => {
    const friday = new Date('2026-06-05T15:00:00'); // Friday
    const next = nextBusinessDay(friday);
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(8);
    expect(next.getHours()).toBe(9);
  });

  it('Saturday and Sunday → Monday', () => {
    expect(nextBusinessDay(new Date('2026-06-06T10:00:00')).getDay()).toBe(1);
    expect(nextBusinessDay(new Date('2026-06-07T10:00:00')).getDay()).toBe(1);
  });

  it('Tuesday → Wednesday', () => {
    const next = nextBusinessDay(new Date('2026-06-02T10:00:00')); // Tuesday
    expect(next.getDay()).toBe(3);
  });
});

describe('snapToBusinessDay', () => {
  it('passes weekdays through unchanged', () => {
    const wednesday = new Date('2026-06-03T14:30:00');
    expect(snapToBusinessDay(wednesday).getTime()).toBe(wednesday.getTime());
  });

  it('moves Saturday to Monday 09:00', () => {
    const snapped = snapToBusinessDay(new Date('2026-06-06T14:30:00'));
    expect(snapped.getDay()).toBe(1);
    expect(snapped.getHours()).toBe(9);
  });
});

describe('isWeekend', () => {
  it('flags Saturday/Sunday only', () => {
    expect(isWeekend(new Date('2026-06-06T00:00:00'))).toBe(true);
    expect(isWeekend(new Date('2026-06-07T00:00:00'))).toBe(true);
    expect(isWeekend(new Date('2026-06-08T00:00:00'))).toBe(false);
  });
});
