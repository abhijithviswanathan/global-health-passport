/** Pure prescriptions rendering: consumes a snapshot and returns HTML. */
import { grantPrompt } from "./records.mjs";
import {
  escape,
  date,
  label,
  icon,
  button,
  badge,
  empty,
  heading,
  personLine,
} from "../components.mjs";
import { people } from "../../data.mjs";
import { hasScope } from "../../store.mjs";

/** One prescription card is reused across doctor, patient and pharmacy with different controls. */
export function prescriptionsView(context) {
  const { state, role, patient } = context;
  const p = people[patient],
    isDoctor = role === "doctor";
  if (isDoctor && !hasScope(state, patient, "prescriptions"))
    return (
      heading(
        "Prescriptions, end to end.",
        "From a reviewed example to the patient’s directions and pharmacy collection.",
      ) + grantPrompt(context, "prescriptions")
    );
  const rows = state.prescriptions
    .filter((rx) => role === "pharmacy" || rx.patient === patient)
    .sort((a, b) => (b.patient === patient) - (a.patient === patient));
  return (
    heading(
      role === "pharmacy"
        ? "From review to ready."
        : role === "patient"
          ? "Your prescriptions, clearly explained."
          : "Prescriptions, end to end.",
      "Invented medicines for presentation only. These examples are not valid prescriptions.",
    ) +
    (isDoctor
      ? `<div class="callout split"><div><strong>Create for ${p.name}</strong><p>Review the sample details before sending them to the patient and Harbor Pharmacy.</p></div>${button("Review new prescription", "rx-dialog")}</div>`
      : "") +
    (rows.length
      ? rows.map((rx) => prescriptionCard(context, rx)).join("")
      : empty(
          "No prescription here yet",
          "After patient approval, Dr Smith can review and send a sample prescription. It will appear here and in the pharmacy queue.",
        ))
  );
}

export function prescriptionCard(context, rx, preview = false) {
  const { state, role } = context;
  const med = rx.medicine,
    p = people[rx.patient],
    sequence = ["sent", "reviewed", "ready", "dispensed"];
  const controls = preview
    ? ""
    : role === "patient"
      ? `${rx.read ? '<span class="badge green">Instructions marked as seen</span>' : button("I have read the directions", "ack-prescription", `data-id="${rx.id}"`)}${button("Ask Dr Smith a question", "nav", 'data-view="messages"', "secondary")}`
      : role === "pharmacy" && rx.status !== "dispensed"
        ? hasScope(state, rx.patient, "prescriptions")
          ? button(
              {
                sent: "Review prescription",
                reviewed: "Mark ready for collection",
                ready: "Record collection",
              }[rx.status],
              "pharmacy-dialog",
              `data-id="${rx.id}"`,
            )
          : '<p class="callout warning">Patient sharing ended. Renew the prescription scope before continuing.</p>'
        : "";
  return `<article class="panel prescription"><div class="panelhead">${personLine(p)}${rx.id === "DRAFT" ? '<span class="badge gray">Draft example</span>' : badge(rx.status)}</div><div class="rx-heading"><span class="rx-symbol">℞</span><div><p class="eyebrow">Fictional prescription · ${escape(rx.id)}</p><h2>${med.name} <span class="muted">${med.strength}</span></h2><p>${med.form} · invented medicine</p></div></div><dl class="rx-grid">${[
    ["Dose", med.dose],
    ["Route", med.route],
    ["Frequency", med.frequency],
    ["Duration", med.duration],
    ["Quantity", med.quantity + " example tablets"],
    ["Refills", med.refills],
  ]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join(
      "",
    )}</dl><div class="directions"><strong>Directions & notes</strong><p>${med.instructions}</p><small>Read status is not a record that a medicine was taken.</small></div><div class="rx-source"><div><strong>Prescriber</strong><span>Dr Smith · NorthStar Clinic</span></div><div><strong>Destination</strong><span>Harbor Pharmacy · 12 Example Square</span></div><div><strong>Created</strong><span>${date(rx.createdAt)}</span></div></div>${preview ? "" : `<ol class="rx-progress" aria-label="Prescription progress">${sequence.map((s, i) => `<li class="${i <= sequence.indexOf(rx.status) ? "reached" : ""}"><span>${i <= sequence.indexOf(rx.status) ? icon("check") : i + 1}</span>${label(s)}</li>`).join("")}</ol>`}<div class="buttonrow">${controls}${preview ? "" : button("Print sample", "print-rx", `data-id="${rx.id}"`, "secondary")}</div><p class="print-warning">SAMPLE ONLY · NOT A VALID PRESCRIPTION · NOT FOR MEDICAL USE</p></article>`;
}
