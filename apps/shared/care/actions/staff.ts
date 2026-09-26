/** Action builders for staff; they describe forms but never grant server permission. */
import type { CareActionContext } from "./context";
import type { Action } from "../contracts";
import { careRoles, scopeKinds } from "../definitions";

export function assignPatient(input: CareActionContext): Action[] {
  const { role, tab } = input;
  const a: Action[] = [];

  if (tab === "Access" && ["admin", "coordinator"].includes(role))
    a.push({
      id: "assignment",
      label: "Assign patient access",
      path: "/care/assignments",
      fields: [
        { key: "healthId", label: "Patient Health ID" },
        {
          key: "staffId",
          label: "Staff member",
          type: "select",
          source: "staff",
        },
        {
          key: "scopes",
          label: "Work scopes (clinical access also requires patient consent)",
          type: "multi",
          options: scopeKinds,
        },
        {
          key: "expiresAt",
          label: "Assignment expiry with UTC offset",
          type: "datetime",
        },
        {
          key: "version",
          label: "Current assignment version (0 for a new assignment)",
          type: "number",
          value: 0,
        },
        {
          key: "active",
          label: "Access assignment active",
          type: "check",
          value: true,
        },
      ],
    });
  return a;
}

export function provisionStaff(input: CareActionContext): Action[] {
  const { role, tab } = input;
  const a: Action[] = [];

  if (tab === "Access" && role === "admin")
    a.push({
      id: "provision",
      label: "Add staff account",
      path: "/care/staff",
      fields: [
        { key: "username", label: "Username" },
        { key: "name", label: "Full name" },
        {
          key: "role",
          label: "Role",
          type: "select",
          options: careRoles.filter((r) => r !== "admin"),
        },
        { key: "department", label: "Department" },
        {
          key: "password",
          label: "Initial password (12+ characters)",
          type: "password",
        },
      ],
    });
  return a;
}

export function freshnessRule(input: CareActionContext): Action[] {
  const { role, context } = input;
  const a: Action[] = [];

  if (context.rule && role === "admin")
    a.push({
      id: "rule",
      label: "Edit freshness interval",
      path: `/care/freshness/${context.rule.kind}`,
      method: "PUT",
      fixed: { version: context.rule.version },
      fields: [
        {
          key: "minutes",
          label: "Freshness interval in minutes",
          type: "number",
          value: context.rule.minutes,
        },
      ],
    });
  return a;
}

export function staffAccess(input: CareActionContext): Action[] {
  const { role, context } = input;
  const a: Action[] = [];

  if (context.member && role === "admin")
    a.push({
      id: "staff",
      label: "Update staff access",
      path: `/care/staff/${context.member.id}`,
      method: "PATCH",
      fixed: { version: context.member.staff_version },
      fields: [
        {
          key: "department",
          label: "Department",
          value: context.member.department,
        },
        {
          key: "active",
          label: "Staff access active",
          type: "check",
          value: context.member.staff_active,
        },
      ],
    });
  return a;
}

export function clinicalVerification(input: CareActionContext): Action[] {
  const { role, context } = input;
  const a: Action[] = [];

  if (
    context.member &&
    role === "admin" &&
    ["doctor", "nurse", "lab", "diagnostic", "pharmacy"].includes(
      context.member.role,
    )
  )
    a.push({
      id: "verification",
      label: "Review clinical staff verification",
      path: `/organization/members/${context.member.id}/verification`,
      fields: [
        {
          key: "status",
          label: "Verification decision",
          type: "select",
          options: ["verified", "suspended"],
        },
        {
          key: "evidenceReference",
          label: "Verification evidence or suspension reason",
          type: "long",
        },
      ],
    });
  return a;
}
