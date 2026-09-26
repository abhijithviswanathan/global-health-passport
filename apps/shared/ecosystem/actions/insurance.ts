/** Action builders for insurance; they describe forms but never grant server permission. */
import type { EcosystemActionContext } from "./context";
import type { Action, Row } from "../../care/contracts";
import { f, select, choices, time, form } from "../definitions";

export function createInsuranceProfile(
  input: EcosystemActionContext,
): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

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
  return out;
}

export function createPlan(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

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
  return out;
}

export function editInsuranceProfile(input: EcosystemActionContext): Action[] {
  const { role, section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Insurance" && role === "patient") {
    // Reuse the create form explicitly; builders never depend on another builder's output.
    const a = createInsuranceProfile(input)[0];
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
  return out;
}

export function reviewPlan(input: EcosystemActionContext): Action[] {
  const { section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
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
  return out;
}

export function checkEligibility(input: EcosystemActionContext): Action[] {
  const { role, section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
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
  return out;
}
