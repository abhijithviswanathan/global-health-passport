/**
 * Pure validation for the optional, user-selected offline emergency snapshot.
 * One to five eligible entries, bounded UTF-8 size and a 24-hour expiry are required.
 * Storage and biometric handling live in App.tsx; this module neither saves nor
 * authorizes access. Expired or malformed data must be rejected, not repaired.
 */
import type { Entry } from "./api";
export const EMERGENCY_MAX_BYTES = 1800;
export const EMERGENCY_TTL_MS = 24 * 60 * 60 * 1000;
export type EmergencySnapshot = {
  version: 1;
  patientId: string;
  generatedAt: string;
  expiresAt: string;
  entries: Entry[];
};
export const eligibleEmergencyEntry = (entry: Entry) =>
  entry.status === "active" &&
  ["allergy", "medication", "prescription"].includes(entry.kind);
export function utf8Bytes(text: string): number {
  return Array.from(text).reduce((total, char) => {
    const code = char.codePointAt(0)!;
    return total + (code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4);
  }, 0);
}
// Copy only the supported fields and reject oversize text rather than truncating a clinical fact.
export function createEmergencySnapshot(
  patientId: string,
  entries: Entry[],
  now = Date.now(),
): EmergencySnapshot {
  if (
    !patientId ||
    entries.length < 1 ||
    entries.length > 5 ||
    !entries.every(eligibleEmergencyEntry)
  )
    throw new Error("Select one to five allergy or medication records.");
  const selected = entries.map(
    ({
      id,
      kind,
      title,
      details,
      source,
      status,
      createdAt,
      clinicalStatus,
    }) => ({
      id,
      kind,
      title,
      details,
      source,
      status,
      createdAt,
      ...(clinicalStatus ? { clinicalStatus } : {}),
    }),
  );
  const snapshot: EmergencySnapshot = {
    version: 1,
    patientId,
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + EMERGENCY_TTL_MS).toISOString(),
    entries: selected,
  };
  if (utf8Bytes(JSON.stringify(snapshot)) > EMERGENCY_MAX_BYTES)
    throw new Error(
      "These records exceed secure storage limits. Select fewer or shorter records; no clinical text will be truncated.",
    );
  return snapshot;
}
// Treat saved bytes as untrusted: validate size, time window and every selected entry before display.
export function parseEmergencySnapshot(
  raw: string,
  now = Date.now(),
): EmergencySnapshot {
  if (utf8Bytes(raw) > EMERGENCY_MAX_BYTES)
    throw new Error("The saved summary is invalid. Save a new summary online.");
  const snapshot = JSON.parse(raw) as EmergencySnapshot;
  const start = Date.parse(snapshot.generatedAt),
    end = Date.parse(snapshot.expiresAt);
  if (
    snapshot.version !== 1 ||
    !snapshot.patientId ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= now ||
    start > now ||
    end <= start ||
    end - start > EMERGENCY_TTL_MS
  )
    throw new Error(
      "The saved emergency summary has expired or its time is invalid. Connect and save a fresh summary.",
    );
  if (
    !Array.isArray(snapshot.entries) ||
    snapshot.entries.length < 1 ||
    snapshot.entries.length > 5 ||
    !snapshot.entries.every(
      (e) =>
        eligibleEmergencyEntry(e) &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        typeof e.details === "string" &&
        typeof e.source === "string" &&
        typeof e.createdAt === "string",
    )
  )
    throw new Error("The saved emergency summary is invalid.");
  return snapshot;
}
