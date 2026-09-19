/**
 * Native appointment/draft contracts and pure booking/date helpers. The API adapter
 * normalizes these row keys to camelCase. Local calendar days are converted to UTC
 * instants only at the request boundary; do not hard-code a day as 24 elapsed hours.
 */
export type Patient = { id: string; displayName: string; healthId: string };
export type Appointment = {
  id: string;
  patientId: string | null;
  patientName: string;
  healthId: string | null;
  startsAt: number;
  durationMinutes: number;
  reason: string;
  visitMode: string;
  status: string;
  version: number;
  access: boolean;
  canDocument: boolean;
  completedRecordId: string | null;
};
export type Draft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  version: number;
  updatedAt: string;
};
export const emptyDraft = (): Draft => ({
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  version: 0,
  updatedAt: "",
});
export const closed = (a: Appointment) =>
  ["completed", "cancelled", "no_show"].includes(a.status);
export function localDay(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
// Round-trip the local date/time to reject impossible dates and daylight-saving skipped times.
export function localInstant(day: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error(
      "Enter a date as YYYY-MM-DD and a time as HH:MM in 24-hour format.",
    );
  const d = new Date(`${day}T${time}:00`);
  if (
    Number.isNaN(d.getTime()) ||
    localDay(d) !== day ||
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` !==
      time
  )
    throw new Error(
      "This local date or time does not exist. Choose another time.",
    );
  return d;
}
// Advance the calendar date, not milliseconds: a local day can be 23 or 25 hours.
export function dayRange(day: string) {
  const from = localInstant(day, "00:00");
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
export function shiftDay(day: string, delta: number) {
  const d = localInstant(day, "12:00");
  d.setDate(d.getDate() + delta);
  return localDay(d);
}
export function bookingPayload(
  patientId: string,
  day: string,
  time: string,
  duration: string,
  reason: string,
  mode: string,
  requestKey: string,
) {
  const startsAt = localInstant(day, time).toISOString();
  const minutes = Number(duration);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 180)
    throw new Error("Choose a duration from 5 to 180 minutes.");
  if (!reason.trim() || reason.trim().length > 200)
    throw new Error("Add a visit reason of 1 to 200 characters.");
  if (!["in_person", "video"].includes(mode))
    throw new Error("Choose an in-person or video visit.");
  return {
    patientId,
    startsAt,
    duration: minutes,
    reason: reason.trim(),
    mode,
    requestKey,
  };
}
