/** Local-calendar agenda segments shared by the web and native clients. */
export type AgendaEvent = {
  id: string;
  start: number;
  minutes: number;
  status: string;
};
export type AgendaSegment = { start: number; end: number; eventId?: string };
export function buildAgenda(
  day: string,
  events: AgendaEvent[],
): AgendaSegment[] {
  const midnight = new Date(`${day}T00:00:00`),
    finish = new Date(midnight);
  finish.setDate(finish.getDate() + 1);
  if (!Number.isFinite(midnight.getTime())) return [];
  const relevant = events
    .filter(
      (e) =>
        Number.isFinite(e.start) &&
        e.minutes > 0 &&
        !["cancelled", "no_show"].includes(e.status) &&
        e.start < +finish &&
        e.start + e.minutes * 60000 > +midnight,
    )
    .sort((a, b) => a.start - b.start);
  const morning = new Date(midnight);
  morning.setHours(8);
  const evening = new Date(midnight);
  evening.setHours(18);
  let cursor = Math.max(
    +midnight,
    Math.min(+morning, ...relevant.map((e) => e.start)),
  );
  const end = Math.min(
    +finish,
    Math.max(+evening, ...relevant.map((e) => e.start + e.minutes * 60000)),
  );
  const result: AgendaSegment[] = [];
  for (const e of relevant) {
    const start = Math.max(+midnight, e.start),
      until = Math.min(+finish, e.start + e.minutes * 60000);
    if (start > cursor) result.push({ start: cursor, end: start });
    result.push({ start, end: until, eventId: e.id });
    cursor = Math.max(cursor, until);
  }
  if (cursor < end) result.push({ start: cursor, end });
  return result;
}
