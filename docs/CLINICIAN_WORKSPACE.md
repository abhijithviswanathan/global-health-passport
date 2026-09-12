# Doctor workspace — local implementation

The web entry now offers Patient and Doctor / care team tabs. The doctor deep link is `http://localhost:5173/?portal=doctor`. Sign-in authenticates the account's existing server role; choosing a tab never grants a role. Staff accounts are organization-provisioned, and the existing verification/MFA policy remains in force. The locally generated account named `doctor` uses the password already recorded in the private local access file.

Doctors open Today, with schedule totals, an upcoming visit, and access to Patients and Appointments. Existing chart, medication, document, laboratory, sharing, audit, security and learning tools remain available. The Health Passport logo returns to the role's home screen. Back and browser back/forward restore the previous section; the selected schedule date survives a page reload. Browser storage contains only the date preference, not appointment details or draft notes.

## Workflow

1. Request patient permission with a Health ID. The patient approves categories in Sharing & permissions.
2. Search the authorized patient list by name or Health ID. Open a shared chart or book an appointment.
3. Select a local date/time, duration, reason and in-person/video type. Overlapping bookings are rejected on the server. Video links and invitations are arranged separately.
4. Check in, reschedule, cancel, mark no-show, or open Prepare visit.
5. Read the shared source records beside a SOAP-style draft. The follow-up writing guide offers prompts; it does not insert clinical assertions. “Use visit reason” copies only the booking reason into an empty history field.
6. Save draft, leave and reopen it. Drafts are stored on the server, scoped to the booking's doctor and patient. They are not yet clinical records.
7. Start the visit, review the note, confirm the patient and file it. Completion adds one encounter record and marks the appointment complete in one transaction. Retrying completion does not create another record.

## Time-saving changes

Patient selection carries into booking and documentation, eliminating re-entry of identity. Relevant shared records and the note are visible together. The appointment reason can be reused explicitly. Saved drafts continue across reloads and sessions. Final filing writes the clinical note once, instead of maintaining disconnected appointment and record copies. Actual time saved still needs observation with clinicians; no measured adoption claim is made.

## Controls and boundaries

- Only authenticated, verified doctors can call clinician endpoints. Administrative or patient roles do not inherit this access.
- Treatment permission is required for patient details and booking. Encounter scope is required for reading or writing the visit draft and filing the encounter.
- Appointments belong to one doctor. Another doctor cannot access or modify that appointment, even if the patient has separately shared their chart.
- Revoked or expired permission hides patient identity and reason on the owning doctor's schedule. A redacted time slot can still be cancelled; clinical details and drafts remain denied.
- Per-doctor database locks serialize booking/rescheduling; optimistic versions reject stale appointment and draft writes. Duplicate booking keys and repeat completion are handled safely.
- Closed visits cannot be edited through the draft workflow. Existing author amendments remain the route to correcting a filed clinical record.
- Shared context carries source labels and recorded timestamps. Empty categories do not mean “none”, and recorded prescriptions are not asserted to be current medicines.
- Draft changes prompt before leaving, and periodic/focus checks revalidate access. Previously displayed information is not remotely retractable; server reads/writes are independently authorized.

This is a local synthetic workflow. It does not add patient self-booking, clinician availability rules, external calendar synchronization, invitation delivery, built-in video, staff assignment, billing, reminders or automated clinical decisions. Those integrations remain future work.

## Data and operations

Migration V11 adds `appointment` and `visit_draft`. Include both in future logical and physical backup/restore exercises. The pre-migration local H2 file was copied into the ignored `.runtime/pre-clinician-migration` directory after a graceful service stop. This does not substitute for a complete production recovery drill.

API routes are under `/api/clinician`: list/create appointments; read/update an owned appointment; read/save its draft; and complete the visit. Lists require an explicit bounded date range. All writes retain existing CSRF protection and audit recording.

## Mobile parity

The native mobile source now includes the same doctor entry, schedule, authorized patient directory, shared chart, booking/rescheduling, status changes and saved-draft/completion workflow. It uses the same Java endpoints and optimistic versions as web. The native layout stacks chart context above documentation and uses local date/time fields plus day/duration shortcuts. Back and logo-to-home are implemented for both patient and doctor screens. See [Platform parity](PLATFORM_PARITY.md) and the mobile README for exact test boundaries.

## Doctor UI refinement

Both clients now show a visual day agenda with start/end timestamps, status-labelled visit cards, explicit unbooked intervals and direct visit opening. The shared agenda model handles ordering, cancelled/no-show exclusions and midnight clipping; both clients fetch the preceding three hours to include a visit crossing into the selected day. Unbooked intervals are not asserted to be clinician availability.

Patient directory cards group initials, the short Health ID, shared-chart context, the next visit within 31 days, visit reason, duration/mode/status when present, and paired chart/booking actions. No diagnoses or current-medication assertions are invented. Mobile secondary appointment actions are grouped under More options. Back remains compact with a 44-point minimum target; date selection is collapsible, and navigating to a new mobile section resets scroll position. Web uses a responsive two-column patient-card grid.
