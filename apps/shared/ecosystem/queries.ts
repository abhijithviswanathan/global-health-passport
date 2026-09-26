/** Organization queries: shared by the web and native renderers. */
import type { Row } from "../care/contracts";

export type Call = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function sections(role: string, reviewer = false) {
  if (role === "patient")
    return [
      "Insurance",
      "Marketplace",
      "Hospitals",
      "Book appointment",
      "Organization onboarding",
    ];
  if (role === "insurer") return ["Organization", "Plans"];
  const list = ["Overview", "Workforce"];
  if (
    [
      "doctor",
      "nurse",
      "lab",
      "diagnostic",
      "pharmacy",
      "reception",
      "coordinator",
      "admin",
    ].includes(role)
  )
    list.push("Work grid");
  if (["doctor", "nurse", "lab", "diagnostic", "pharmacy"].includes(role))
    list.push("Orders");
  if (role === "nurse") list.push("Nursing");
  if (["doctor", "nurse"].includes(role)) list.push("Handoffs");
  if (["doctor", "pharmacy", "billing", "reception", "admin"].includes(role))
    list.push("Insurance");
  if (role === "admin") list.push("Organization", "Staff");
  if (["admin", "security"].includes(role)) list.push("Audit");
  if (reviewer) list.push("Organization review", "Plan review");
  return list;
}

export async function context(call: Call, role: string) {
  const d: Row = {};
  d.organizations = await call("/ecosystem/organizations");
  if (role !== "patient") {
    Object.assign(d, await call<Row>("/ecosystem/workspace"));
    d.employees = d.staff;
    d.careStaff = d.staff.map((s: Row) => ({ ...s, id: s.user_id }));
    if (
      [
        "doctor",
        "nurse",
        "lab",
        "diagnostic",
        "pharmacy",
        "reception",
        "coordinator",
        "admin",
      ].includes(role)
    ) {
      const c = await call<Row>("/care/workspace");
      d.patients = c.patients;
      d.appointments = c.appointments;
      d.tasks = c.tasks;
    }
  }
  return d;
}

export async function rows(
  call: Call,
  section: string,
  d: Row,
): Promise<Row[]> {
  switch (section) {
    case "Organization":
      return d.nodes || [];
    case "Staff":
      return d.staff || [];
    case "Workforce":
      return d.shifts || [];
    case "Organization review":
      return d.organizations || [];
    case "Work grid":
      return await call<Row[]>("/care/tasks");
    case "Orders":
      return await call<Row[]>("/ecosystem/orders");
    case "Handoffs":
      return await call<Row[]>("/ecosystem/handoffs");
    case "Insurance": {
      const [p, c] = await Promise.all([
        call<Row[]>("/insurance/profiles"),
        call<Row[]>("/insurance/eligibility"),
      ]);
      return p.map((x) => ({
        ...x,
        checks: c.filter((v) => v.profile_id === x.id),
      }));
    }
    case "Plans":
    case "Plan review":
      return await call<Row[]>("/insurance/plans");
    case "Marketplace": {
      const m = await call<Row>("/insurance/marketplace");
      return [...m.organic, ...m.sponsored];
    }
    case "Audit":
      return await call<Row[]>("/ecosystem/audit");
    case "Hospitals":
      return await call<Row[]>("/ecosystem/patient-organizations");
    default:
      return [];
  }
}
