/** Action builders for organization; they describe forms but never grant server permission. */
import type { EcosystemActionContext } from "./context";
import type { Action } from "../../care/contracts";
import { f, select, choices, form } from "../definitions";

export function onboardOrganization(input: EcosystemActionContext): Action[] {
  const { section } = input;
  const out: Action[] = [];

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
  return out;
}

export function createNode(input: EcosystemActionContext): Action[] {
  const { role, section } = input;
  const out: Action[] = [];

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
  return out;
}

export function reviewNode(input: EcosystemActionContext): Action[] {
  const { role, section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
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
  return out;
}

export function reviewOrganization(input: EcosystemActionContext): Action[] {
  const { section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
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
  return out;
}
