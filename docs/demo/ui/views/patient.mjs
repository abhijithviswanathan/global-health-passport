/** Pure patient rendering: consumes a snapshot and returns HTML. */
import {
  stats,
  date,
  icon,
  button,
  badge,
  empty,
  heading,
} from "../components.mjs";
import { chart } from "./records.mjs";
import { people, scopes } from "../../data.mjs";
import { grantFor, unread } from "../../store.mjs";

export function patientHome(context) {
  const { state, role, patient } = context;
  const p = people[patient];
  return (
    heading(
      `Your health, ${p.name.split(" ")[0]}.`,
      "Know what your team needs, what is happening now and what comes next.",
    ) +
    `<section class="hero"><div><p class="eyebrow">Your permanent Health ID · ${p.healthId}</p><h2>Your care story.<br>With you at the centre.</h2><p>A request is yours to review. A prescription is easy to follow. Every update stays in one timeline.</p>${button("Review requests", "nav", 'data-view="requests"')}</div><div class="hero-art"><div class="orbit">${icon("heart")}</div></div></section>` +
    stats([
      [
        state.requests.filter(
          (r) => r.patient === patient && r.status === "pending",
        ).length,
        "Requests to review",
        "lock",
      ],
      [
        state.prescriptions.filter((r) => r.patient === patient).length,
        "Sample prescriptions",
        "plus",
      ],
      [
        state.reports.filter((r) => r.patient === patient).length,
        "Reports available",
        "list",
      ],
      [unread(state, role, patient), "New updates", "bell"],
    ]) +
    `<div class="cards"><section class="panel"><h2>Your next steps</h2><div class="action-stack">${button("Read prescription directions", "nav", 'data-view="prescriptions"', "secondary")}${button("See appointments", "nav", 'data-view="appointments"', "secondary")}${button("Message Dr Smith", "nav", 'data-view="messages"', "secondary")}${button("Open your timeline", "nav", 'data-view="timeline"', "secondary")}</div></section><section class="panel"><h2>Care team</h2><div class="team-list"><p><strong>Dr Smith</strong><span>Consultation & follow-up · NorthStar Clinic</span></p><p><strong>Nurse Williams</strong><span>Observations & coordination</span></p><p><strong>Harbor Pharmacy</strong><span>Sample prescriptions & collection</span></p></div></section></div><h2 class="section-title">Your health summary</h2>${chart(context)}`
  );
}

export function sharingView(context) {
  const { state, patient } = context;
  const pending = state.requests.filter(
      (r) => r.patient === patient && r.status === "pending",
    ),
    grant = grantFor(state, patient);
  return (
    heading(
      "You decide who sees what.",
      "Review the requester, purpose, information and duration before sharing.",
    ) +
    `<div class="callout"><strong>Sharing in this demonstration</strong><p>Approvals control the simulated workflow in this tab. Every fixture is already public; this is not real account security. Sharing can be revoked and does not erase existing historical entries.</p></div>` +
    pending
      .map(
        (r) =>
          `<section class="panel consent-card"><div class="panelhead"><div><p class="eyebrow">New request · ${date(r.requestedAt)}</p><h2>Dr Smith would like to access your care information</h2></div>${badge("pending")}</div><p>NorthStar Clinic · purpose: prepare your consultation and coordinate your care team.</p><form data-form="consent" data-id="${r.id}"><fieldset><legend>Choose what to share</legend>${r.scope.map((key) => `<label class="scope-option"><input type="checkbox" name="scope" value="${key}" checked><span><strong>${scopes[key].title}</strong><small>${scopes[key].detail}</small></span></label>`).join("")}</fieldset><label class="field">Share for<select name="days"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="30">30 days</option></select></label><p class="muted">Duration uses the fictional demo clock. Uncheck a scope to withhold it; choose Decline to share nothing.</p><div class="buttonrow"><button class="primary" type="submit">Approve selected sharing</button>${button("Decline request", "decline-access", `data-id="${r.id}" type="button"`, "secondary")}</div></form></section>`,
      )
      .join("") +
    (grant
      ? `<section class="panel"><div class="panelhead"><h2>Active sharing with your care team</h2><span class="badge green">Active</span></div><div class="chips">${grant.scope.map((s) => `<span class="pill">${scopes[s].title}</span>`).join("")}</div><p class="muted">Expires ${date(grant.expiresAt)} · demo time</p><p>Assigned nursing and laboratory work uses the care scope. The pharmacy sees the sample prescription workflow.</p>${button("Revoke sharing", "revoke-dialog", "", "secondary")}</section>`
      : !pending.length
        ? empty(
            "No sharing is active",
            "Switch to the doctor’s Patients page to send yourself a request. You can approve or decline it here.",
          )
        : "") +
    `<h2 class="section-title">Request history</h2>${
      state.requests
        .filter((r) => r.patient === patient && r.status !== "pending")
        .map(
          (r) =>
            `<div class="strip"><span>Dr Smith · ${date(r.requestedAt)}</span>${badge(r.status)}</div>`,
        )
        .join("") || '<p class="muted">Your decisions will appear here.</p>'
    }`
  );
}
