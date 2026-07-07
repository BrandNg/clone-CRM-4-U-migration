/**
 * Convert a target timezone's local day boundaries to UTC Dates.
 */
export function getLocalDayBoundaries(date: Date, timezone: string): { start: Date; end: Date; yesterdayStart: Date } {
  // Format the date to target timezone parts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10) - 1;
  const day = parseInt(partMap.day, 10);

  // Guess target time starts at Date.UTC for that calendar day
  const guessTime = Date.UTC(year, month, day, 0, 0, 0);

  const getOffset = (t: number) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    });
    const pts = f.formatToParts(new Date(t));
    const pm: Record<string, string> = {};
    for (const p of pts) pm[p.type] = p.value;

    const targetUTC = Date.UTC(
      parseInt(pm.year, 10),
      parseInt(pm.month, 10) - 1,
      parseInt(pm.day, 10),
      parseInt(pm.hour, 10),
      parseInt(pm.minute, 10),
      parseInt(pm.second, 10)
    );
    return targetUTC - t; // Positive if local time is ahead of UTC
  };

  const offset = getOffset(guessTime);
  const start = new Date(guessTime - offset);
  const end = new Date(start.getTime() + 86400000);
  const yesterdayStart = new Date(start.getTime() - 86400000);

  return { start, end, yesterdayStart };
}
