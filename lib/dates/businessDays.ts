/**
 * Business-day helpers for task scheduling.
 * Weekends are Saturday/Sunday; no holiday calendar (SKILL.md doesn't define one).
 */

const SATURDAY = 6;
const SUNDAY = 0;

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === SATURDAY || day === SUNDAY;
}

/**
 * The next business day strictly after `from`, at 09:00 local server time.
 * Friday → Monday, Saturday → Monday, Sunday → Monday, Tuesday → Wednesday.
 */
export function nextBusinessDay(from: Date): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + 1);
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(9, 0, 0, 0);
  return result;
}

/**
 * Snap a due date forward off a weekend (Saturday/Sunday → Monday 09:00).
 * Weekday dates pass through unchanged.
 */
export function snapToBusinessDay(date: Date): Date {
  if (!isWeekend(date)) return date;
  const result = new Date(date);
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(9, 0, 0, 0);
  return result;
}
