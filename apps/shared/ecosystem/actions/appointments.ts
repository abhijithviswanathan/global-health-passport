/** Action builders for appointments; they describe forms but never grant server permission. */
import type { EcosystemActionContext } from "./context";
import type { Action } from "../../care/contracts";
import { f, select, form } from "../definitions";

export function findSlots(input: EcosystemActionContext): Action[] {
  const { section } = input;
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
  return out;
}

export function bookSlot(input: EcosystemActionContext): Action[] {
  const { section, selected } = input;
  const out: Action[] = [];
  const s = selected;
  if (!s) return out;
  if (section === "Book appointment")
    out.push(
      form("book", "Book this appointment", "/ecosystem/public-booking", [], {
        organizationId: s.organizationId,
        doctorId: s.doctorId,
        startsAt: s.startsAt,
      }),
    );
  return out;
}
