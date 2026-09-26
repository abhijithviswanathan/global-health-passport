/** Action builders for workforce; they describe forms but never grant server permission. */
import type { EcosystemActionContext } from "./context";
import type { Action } from "../../care/contracts";
import { f, select, choices, time, form, jobs } from "../definitions";

export function inviteStaff(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

  if (section === "Staff" && role === "admin")
    out.push(
      form("invite", "Invite an employee", "/ecosystem/invitations", [
        f("username", "Work username"),
        choices("professionalRole", "Professional role", jobs),
        f("department", "Department"),
      ]),
    );
  return out;
}

export function createShift(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

  if (section === "Workforce" && ["admin", "coordinator"].includes(role))
    out.push(
      form("shift", "Schedule work or time off", "/ecosystem/shifts", [
        select("employeeId", "Employee", "employees"),
        select("nodeId", "Location / department / unit", "nodes", true),
        choices("kind", "Schedule type", [
          "shift",
          "rotation",
          "on_call",
          "leave",
          "break",
          "coverage",
          "substitution",
          "procedure",
        ]),
        time("startsAt", "Starts"),
        time("endsAt", "Ends"),
        f("specialty", "Specialty", "text", true),
        f("publicBooking", "Publish appointment slots", "check"),
        select("replacesId", "Shift being replaced", "shifts", true),
      ]),
    );
  return out;
}

export function delegatePrivileges(input: EcosystemActionContext): Action[] {
  const { role, section, d } = input;
  const out: Action[] = [];

  if (section === "Workforce" && role === "admin")
    out.push(
      form(
        "policy",
        "Configure appointment availability",
        "/ecosystem/availability-policy",
        [
          {
            ...f("enforce", "Require working shifts for appointments", "check"),
            value: d.policy?.enforce_availability,
          },
        ],
        { version: d.policy?.version },
        "PUT",
      ),
    );
  return out;
}

export function updateShift(input: EcosystemActionContext): Action[] {
  const { role, section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Workforce" && ["admin", "coordinator"].includes(role))
    out.push(
      form(
        "cancelshift",
        "Cancel this schedule interval",
        `/ecosystem/shifts/${s.id}/cancel`,
        [f("reason", "Reason", "long")],
        { version: s.version },
      ),
    );
  return out;
}

export function reviewStaff(input: EcosystemActionContext): Action[] {
  const { role, section, d, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Staff" && role === "admin")
    out.push(
      form(
        "employment",
        "Review employment and credentials",
        `/ecosystem/employment/${s.id}`,
        [
          {
            ...choices("professionalRole", "Professional role", jobs),
            value: s.professional_role,
          },
          { ...f("department", "Department"), value: s.department },
          select("nodeId", "Assigned hierarchy location", "nodes", true),
          {
            ...choices("status", "Employment status", [
              "active",
              "inactive",
              "terminated",
            ]),
            value: s.status,
          },
          { ...time("startAt", "Employment starts", true), value: s.start_at },
          time("endAt", "Employment ends", true),
          time("credentialUntil", "Credential expiration", true),
          choices("credentialStatus", "Credential status", [
            "unverified",
            "verified",
            "suspended",
          ]),
          f("license", "Professional license", "text", true),
          f("jurisdiction", "License jurisdiction", "text", true),
          f("specialty", "Specialty", "text", true),
          {
            ...f("privileges", "Clinical privileges", "multi", true),
            options: d.privilegeCatalog?.[s.professional_role] || [],
            value: (s.privileges || "").split(",").filter(Boolean),
          },
          f("evidence", "Verification evidence or change reason", "long"),
        ],
        { version: s.version },
      ),
    );
  return out;
}
