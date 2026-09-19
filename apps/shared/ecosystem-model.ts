/**
 * Shared organization/clinical-operations/insurance screen definitions. context()
 * loads supporting choices, rows() loads a section, actions() describes forms, and
 * fields() narrows visible inputs. Call abstracts web/native HTTP differences.
 * Keep private insurance and public marketplace payloads separated.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- permission-scoped API contracts */
import {
  type Row,
  type Action,
  type Field,
  actions as careActions,
  readable,
} from "./care-model";
export type Call = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  optional = false,
): Field => ({ key, label, type, optional });
const select = (
  key: string,
  label: string,
  source: string,
  optional = false,
): Field => ({ ...f(key, label, "select", optional), source });
const choices = (
  key: string,
  label: string,
  options: string[],
  optional = false,
): Field => ({ ...f(key, label, "select", optional), options });
const patient = select("patientId", "Patient", "patients"),
  encounter = select("encounterId", "Encounter", "appointments", true),
  time = (key: string, label: string, optional = false) =>
    f(key, label + " (with UTC offset)", "datetime", optional);
const form = (
  id: string,
  label: string,
  path: string,
  fields: Field[],
  fixed?: Row,
  method = "POST",
): Action => ({ id, label, path, fields, fixed, method });
export const jobs = [
  "physician",
  "surgeon",
  "resident",
  "fellow",
  "nurse",
  "nurse_practitioner",
  "physician_assistant",
  "medical_assistant",
  "laboratory_technician",
  "radiology_technician",
  "radiologist",
  "pharmacist",
  "therapist",
  "receptionist",
  "scheduler",
  "billing_staff",
  "department_manager",
  "hospital_administrator",
  "security_administrator",
];
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
// Load supporting rows for this role. employment IDs and user IDs differ; careStaff maps
// user_id into the option ID expected by care-team actions.
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
// Resolve the active section without duplicating endpoint selection in each client.
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
// Build organization/order/insurance forms. Keep action paths and field names in step with Java.
export function actions(
  role: string,
  section: string,
  selected: Row | null,
  d: Row,
): Action[] {
  const out: Action[] = [];
  if (section === "Book appointment")
    out.push(
      form(
        "slots",
        "Find public appointment times",
        "/ecosystem/public-slots",
        [
          select("organizationId", "Hospital or clinic", "organizations"),
          f("date", "Date (YYYY-MM-DD)"),
        ],
        undefined,
        "GET",
      ),
    );
  if (section === "Organization onboarding")
    out.push(
      form(
        "onboard",
        "Request organization verification",
        "/ecosystem/onboard",
        [
          f("name", "Organization name"),
          choices("type", "Organization type", [
            "group",
            "hospital",
            "clinic",
            "diagnostic_center",
            "laboratory",
            "pharmacy",
            "insurer",
          ]),
          f("adminName", "Administrator name"),
          f("adminUsername", "Separate work username"),
          f("password", "Work account password (12+ characters)", "password"),
        ],
      ),
    );
  if (section === "Organization" && role === "admin")
    out.push(
      form("node", "Add organization detail", "/ecosystem/nodes", [
        choices("kind", "Item type", [
          "location",
          "department",
          "unit",
          "team",
          "specialty",
          "service",
          "hours",
          "lab_capability",
          "imaging_capability",
          "pharmacy_capability",
        ]),
        select("parentId", "Parent location or department", "nodes", true),
        f("name", "Name"),
        f("details", "Configuration details", "long"),
      ]),
    );
  if (section === "Staff" && role === "admin")
    out.push(
      form("invite", "Invite an employee", "/ecosystem/invitations", [
        f("username", "Work username"),
        choices("professionalRole", "Professional role", jobs),
        f("department", "Department"),
      ]),
    );
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
  if (section === "Orders" && role === "doctor")
    out.push(
      form("order", "Create structured order", "/ecosystem/orders", [
        patient,
        encounter,
        choices("kind", "Order type", [
          "laboratory",
          "imaging",
          "medication",
          "procedure",
          "consultation",
          "therapy",
        ]),
        f("code", "Test, procedure or medication"),
        select("assigneeId", "Assigned service employee", "careStaff"),
        choices("priority", "Priority", ["routine", "high", "urgent"]),
        f("instructions", "Instructions", "long"),
        f("specimenType", "Specimen type", "text", true),
        f("modality", "Imaging modality", "text", true),
        f("dosage", "Medication dosage", "text", true),
        f("route", "Medication route", "text", true),
        f("frequency", "Medication frequency", "text", true),
        f("duration", "Medication duration", "text", true),
        { ...f("quantity", "Medication quantity", "number", true), value: 1 },
        { ...f("refills", "Refills", "number", true), value: 0 },
      ]),
    );
  if (section === "Nursing")
    out.push(
      form("nursing", "Document nursing care", "/ecosystem/nursing", [
        patient,
        encounter,
        choices("entryType", "Type of care", [
          "pain",
          "assessment",
          "observation",
          "intake_output",
          "medication_administration",
          "wound",
          "patient_status",
          "nursing_note",
        ]),
        time("observedAt", "Observed or administered"),
        f("details", "Observation and context", "long"),
        f("room", "Room or bed", "text", true),
        f("painScore", "Pain score (0–10)", "number", true),
        f("intakeMl", "Intake (mL)", "number", true),
        f("outputMl", "Output (mL)", "number", true),
        select("prescriptionId", "Authorized prescription", "records", true),
        f("dose", "Administered dose", "text", true),
        f("route", "Administration route", "text", true),
        f(
          "identityChecked",
          "I checked patient, prescription, dose, route and time",
          "check",
        ),
      ]),
    );
  if (section === "Handoffs")
    out.push(
      form("handoff", "Prepare shift handoff", "/ecosystem/handoffs", [
        patient,
        encounter,
        select("incomingId", "Incoming care-team member", "careStaff"),
        ...[
          "patientStatus",
          "pendingTasks",
          "medications",
          "tests",
          "observations",
          "concerns",
        ].map((k) =>
          f(
            k,
            (
              {
                patientStatus: "Patient status",
                pendingTasks: "Pending tasks",
                medications: "Medication attention",
                tests: "Tests awaiting results",
                observations: "Important observations",
                concerns: "Escalation concerns",
              } as Row
            )[k],
            "long",
          ),
        ),
      ]),
    );
  if (section === "Work grid")
    out.push(
      ...careActions(role, "Tasks").map((a) => ({
        ...a,
        fields: [
          ...a.fields,
          f("taskType", "Clinical task type", "text", true),
          f("location", "Room / location", "text", true),
          {
            ...f("dependencies", "Prerequisite tasks", "multi", true),
            source: "tasks",
          },
        ],
      })),
    );
  if (section === "Insurance" && role === "patient") {
    out.push(
      form("insurance", "Add insurance", "/insurance/profiles", [
        f("company", "Insurance company"),
        f("plan", "Plan name"),
        f("memberId", "Member ID"),
        f("groupId", "Group ID", "text", true),
        f("policyholder", "Policyholder"),
        choices("relationship", "Relationship", [
          "self",
          "spouse",
          "child",
          "other",
        ]),
        f("effectiveDate", "Effective date (YYYY-MM-DD)", "text", true),
        f("expirationDate", "Expiration date (YYYY-MM-DD)", "text", true),
        choices("coverageOrder", "Coverage order", [
          "primary",
          "secondary",
          "other",
        ]),
        select("cardDocumentId", "Uploaded insurance card", "documents", true),
        f("coverageSummary", "Coverage information (if known)", "long", true),
      ]),
    );
  }
  if (section === "Plans" && role === "insurer")
    out.push(
      form("plan", "Submit plan for review", "/insurance/plans", [
        f("name", "Plan name"),
        f("region", "Geographic availability"),
        choices("networkType", "Network type", [
          "HMO",
          "PPO",
          "EPO",
          "POS",
          "other",
        ]),
        { ...f("currency", "Currency"), value: "USD" },
        f("monthlyPremium", "Monthly premium", "number"),
        f("deductible", "Deductible", "number"),
        f("copay", "Copay information"),
        f("coinsurance", "Coinsurance information"),
        f("outOfPocket", "Out-of-pocket maximum", "number"),
        f("coverage", "Major coverage categories", "long"),
        f("eligibility", "Eligibility criteria", "long"),
        f("documentsUrl", "HTTPS plan document link", "text", true),
      ]),
    );
  if (!selected) return out;
  const s = selected;
  if (section === "Book appointment")
    out.push(
      form("book", "Book this appointment", "/ecosystem/public-booking", [], {
        organizationId: s.organizationId,
        doctorId: s.doctorId,
        startsAt: s.startsAt,
      }),
    );
  if (section === "Insurance" && role === "patient") {
    const a = out.find((a) => a.id === "insurance");
    if (a) {
      const mapping: Row = {
        plan: "plan_name",
        coverageOrder: "coverage_order",
        effectiveDate: "effective_date",
        expirationDate: "expiration_date",
        coverageSummary: "coverage_summary",
        cardDocumentId: "card_document_id",
      };
      out.push({
        ...a,
        id: "insurance",
        label: "Edit this insurance profile",
        fixed: { id: s.id, version: s.version },
        fields: a.fields.map((f) => ({
          ...f,
          value: ["memberId", "groupId", "policyholder"].includes(f.key)
            ? ""
            : (s[mapping[f.key] || f.key] ?? ""),
        })),
      });
    }
  }

  if (section === "Organization" && role === "admin")
    out.push(
      form(
        "editnode",
        "Edit organization detail",
        `/ecosystem/nodes/${s.id}`,
        [
          { ...f("name", "Name"), value: s.name },
          {
            ...f("details", "Configuration details", "long"),
            value: s.details,
          },
          { ...f("active", "Active", "check"), value: s.active },
        ],
        { version: s.version },
        "PATCH",
      ),
    );
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
  if (section === "Organization review")
    out.push(
      form(
        "verifyorg",
        "Review organization",
        `/ecosystem/organizations/${s.id}/verify`,
        [
          choices("status", "Decision", ["verified", "suspended"]),
          select(
            "parentId",
            "Verified parent healthcare group (optional)",
            "organizations",
            true,
          ),
          f("evidence", "Independent verification evidence", "long"),
        ],
        { version: s.version },
      ),
    );
  if (section === "Plan review")
    out.push(
      form(
        "reviewplan",
        "Review marketplace plan",
        `/insurance/plans/${s.id}/review`,
        [
          choices("status", "Decision", ["approved", "rejected"]),
          f("reason", "Review reason", "long"),
        ],
        { version: s.version },
      ),
    );
  if (
    section === "Handoffs" &&
    s.incoming_id === d.userId &&
    s.status === "sent"
  )
    out.push(
      form(
        "ack",
        "Acknowledge handoff",
        `/ecosystem/handoffs/${s.id}/acknowledge`,
        [],
        { version: s.version },
      ),
    );
  if (section === "Insurance") {
    if (role === "patient")
      out.push(
        form(
          "share",
          "Share insurance with care organization",
          "/insurance/shares",
          [
            select("organizationId", "Organization", "organizations"),
            f("granteeId", "Specific work account ID (optional)", "text", true),
            f("department", "Limit to department", "text", true),
            choices("purpose", "Purpose", [
              "eligibility",
              "billing",
              "treatment",
              "dispensing",
            ]),
            time("expiresAt", "Sharing expires"),
          ],
          { profileId: s.id },
        ),
      );
    if (["admin", "billing", "reception"].includes(role))
      out.push(
        form(
          "eligibility",
          "Request eligibility check",
          `/insurance/profiles/${s.id}/eligibility`,
          [],
        ),
      );
  }
  if (section === "Work grid")
    out.push(...careActions(role, "", { task: s, userId: d.userId }));
  if (section === "Orders") {
    const flow =
      s.kind === "laboratory"
        ? [
            "ordered",
            "accepted",
            "specimen_collected",
            "processing",
            "result_pending",
            "result_ready",
            "reviewed",
            "completed",
          ]
        : s.kind === "imaging"
          ? [
              "ordered",
              "scheduled",
              "patient_arrived",
              "imaging",
              "study_available",
              "interpretation",
              "result_ready",
              "report_signed",
              "reviewed",
              "completed",
            ]
          : ["ordered", "accepted", "in_progress", "completed"];
    const next = flow[flow.indexOf(s.status) + 1];
    const authorized =
      s.assigned_id === d.userId ||
      (role === "nurse" && next === "specimen_collected") ||
      (role === "doctor" && ["reviewed", "report_signed"].includes(next));
    if (next && authorized) {
      const fields: Field[] = [];
      if (next === "specimen_collected")
        fields.push(
          f("patientHealthId", "Confirm patient Health ID"),
          f("specimenCode", "Scan or enter specimen code"),
          time("observedAt", "Collected"),
        );
      if (next === "study_available")
        fields.push(f("studyUid", "DICOM Study Instance UID"));
      if (next === "result_ready")
        fields.push(
          f("report", "Result report", "long"),
          time("observedAt", "Observation"),
          f("critical", "Flag critical result for clinician review", "check"),
        );
      if (["reviewed", "report_signed"].includes(next))
        fields.push(
          f("review", "Review and next steps", "long"),
          f("reviewed", "I reviewed this result", "check"),
        );
      out.push(
        form(
          "orderstatus",
          `Move to ${readable(next)}`,
          `/ecosystem/orders/${s.id}`,
          fields,
          { version: s.version, status: next },
          "PATCH",
        ),
      );
    }
  }
  return out;
}
export function fields(a: Action, v: Row) {
  return a.fields.filter((f) => {
    if (a.id === "nursing") {
      if (f.key === "painScore") return v.entryType === "pain";
      if (["intakeMl", "outputMl"].includes(f.key))
        return v.entryType === "intake_output";
      if (
        ["prescriptionId", "dose", "route", "identityChecked"].includes(f.key)
      )
        return v.entryType === "medication_administration";
    }
    if (a.id === "order") {
      if (f.key === "modality") return v.kind === "imaging";
      if (f.key === "specimenType") return v.kind === "laboratory";
      if (
        [
          "dosage",
          "route",
          "frequency",
          "duration",
          "quantity",
          "refills",
        ].includes(f.key)
      )
        return v.kind === "medication";
    }
    return true;
  });
}
export function title(r: Row) {
  return r.patient_name && r.code
    ? `${r.code} · ${r.patient_name}`
    : r.title ||
        r.plan_name ||
        r.name ||
        r.work_id ||
        readable(r.action || r.resource_type || r.id);
}
export function lines(section: string, r: Row) {
  switch (section) {
    case "Workforce":
      return [
        readable(r.kind),
        `${new Date(r.starts_at).toLocaleString()} → ${new Date(r.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        r.professional_role,
        r.public_booking ? "Public appointment slots" : "Internal schedule",
      ];
    case "Staff":
      return [
        readable(r.professional_role),
        `Work ID: ${r.work_id}`,
        `Employment: ${r.status} · Credentials: ${r.credential_status}`,
        r.department,
      ];
    case "Work grid":
      return [
        r.patient_name || "Operational task",
        r.assignee_name || r.team || "Team",
        r.location_label || "Location not specified",
        r.due_at ? "Due " + new Date(r.due_at).toLocaleString() : "No due time",
        `${readable(r.priority)} · ${readable(r.status)}`,
      ];
    case "Orders":
      return [
        readable(r.kind) + " · " + readable(r.status),
        r.assignee_name,
        `Priority: ${r.priority}`,
        r.specimen_code ? "Specimen: " + r.specimen_code : r.modality,
        r.critical ? "Critical result — review required" : "",
      ];
    case "Insurance":
      return [
        r.company,
        readable(r.coverage_order),
        `Effective ${r.effective_date || "unknown"} · Ends ${r.expiration_date || "unknown"}`,
        "Identifiers protected",
      ];
    case "Marketplace":
    case "Plans":
    case "Plan review":
      return [
        r.company || "",
        `${r.currency} ${r.monthly_premium}/month · Deductible ${r.deductible}`,
        `${r.network_type} · ${r.region}`,
        r.synthetic
          ? "Synthetic plan — not available for purchase"
          : "Participating plan",
        r.sponsored ? "SPONSORED" : "Organic listing",
      ];
    case "Hospitals":
      return [
        r.code,
        ...(r.care_team || []).map(
          (m: Row) =>
            `${m.name} · ${readable(m.role)} · ${m.department || "Care team"}`,
        ),
        ...(r.appointments || [])
          .slice(0, 5)
          .map(
            (a: Row) =>
              `${new Date(a.starts_at).toLocaleString()} · ${a.doctor} · ${readable(a.status)}`,
          ),
        ...(r.insurance_sharing || []).map(
          (s: Row) =>
            `Insurance: ${readable(s.purpose)} · ${s.status} · until ${new Date(s.expires_at).toLocaleDateString()}`,
        ),
        "Orders, reports and prescriptions are available in your Timeline.",
      ];
    case "Handoffs":
      return [
        r.patient_name,
        `${r.outgoing_name} → ${r.incoming_name}`,
        readable(r.status),
      ];
    case "Organization":
      return [readable(r.kind), r.details];
    default:
      return [
        r.code,
        readable(r.status || r.action || r.severity),
        r.created_at,
      ].filter(Boolean);
  }
}
