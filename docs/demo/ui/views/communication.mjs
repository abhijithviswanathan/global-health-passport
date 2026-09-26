/** Pure communication rendering: consumes a snapshot and returns HTML. */
import {
  patientPicker,
  escape,
  date,
  icon,
  button,
  badge,
  empty,
  heading,
  personLine,
} from "../components.mjs";
import { agenda } from "./doctor.mjs";
import { grantPrompt } from "./records.mjs";
import { people } from "../../data.mjs";
import { hasScope, unread } from "../../store.mjs";

export function appointmentsView(context) {
  const { state, role, patient } = context;
  const rows = state.appointments.filter((a) => a.patient === patient);
  return (
    heading(
      role === "patient"
        ? "Your next visit, together."
        : "A schedule that closes the loop.",
      "An invitation becomes a confirmed appointment only after the patient responds.",
    ) +
    (role === "doctor"
      ? `<div class="columns"><section class="panel"><div class="panelhead"><h2>Friday · 11 September</h2><span class="pill">Eastern time</span></div>${agenda(context)}</section><section class="panel"><h2>Arrange a follow-up</h2><p>${people[patient].name} · Dr Smith · NorthStar Clinic</p><div class="appointment-date"><strong>18</strong><span>September 2026<br>Eastern time · Room 2</span></div><label class="field" for="followup-time">Proposed time<select id="followup-time"><option value="10:30">10:30–11:00</option><option value="14:00">14:00–14:30</option></select></label>${hasScope(state, patient, "care") ? button("Invite patient to follow-up", "invite-followup") : '<p class="callout">Approve Nursing & follow-up sharing first.</p>'}</section></div>`
      : "") +
    `<h2 class="section-title">${role === "patient" ? "Your invitations & follow-ups" : "Patient responses"}</h2>` +
    (rows.length
      ? rows
          .map(
            (a) =>
              `<section class="panel appointment-card"><div class="panelhead"><div><p class="eyebrow">Follow-up with Dr Smith</p><h2>${a.date}</h2><p>${a.time}–${a.time === "14:00" ? "14:30" : "11:00"} Eastern · ${a.place}</p></div>${badge(a.status)}</div><p>${a.status === "invited" ? "The proposed time is awaiting your response." : a.status === "confirmed" ? "Confirmed by the patient. The same status is visible to Dr Smith." : "The patient requested another time. The doctor can send a replacement invitation."}</p>${role === "patient" && a.status === "invited" ? `<div class="buttonrow">${button("Confirm appointment", "confirm-followup", `data-id="${a.id}"`)}${button("Ask for another time", "reschedule-followup", `data-id="${a.id}"`, "secondary")}</div>` : ""}</section>`,
          )
          .join("")
      : empty(
          "No follow-up invitation yet",
          "The doctor can send an invitation. The patient receives it in Appointments and the inbox.",
        ))
  );
}

export function messagesView(context) {
  const { state, role, patient } = context;
  if (role === "doctor" && !hasScope(state, patient, "care"))
    return (
      heading(
        "A conversation with context.",
        "Messages stay attached to the fictional patient.",
      ) + grantPrompt(context, "care")
    );
  const rows = state.messages.filter((m) => m.patient === patient);
  return (
    heading(
      "A conversation with context.",
      "A message does not change treatment or complete a clinical task.",
    ) +
    `<section class="panel conversation"><div class="panelhead">${personLine(people[patient])}<span class="pill">With Dr Smith</span></div><div class="message-list">${rows.length ? rows.map((m) => `<article class="message ${m.from === role ? "own" : ""}"><strong>${m.from === "doctor" ? "Dr Smith" : people[m.patient].name}</strong><p>${escape(m.body)}</p><small>${date(m.createdAt)}</small></article>`).join("") : empty("Start with an example question", "Send the prepared message below, then switch perspective to see the reply.")}</div><div class="callout"><strong>${role === "patient" ? "Ask about your sample prescription" : "Reply to the patient"}</strong><p>${role === "patient" ? "“I have a question about my sample prescription. Can we discuss it at my follow-up?”" : "“Thank you. I have seen your demonstration message and will discuss your questions at the follow-up.”"}</p></div>${button(role === "patient" ? "Send example question" : "Send example reply", "send-message")}<p class="muted small-note">Prepared text keeps this public demo free of personal information. No real messages are sent.</p></section>`
  );
}

export function inboxView(context) {
  const { state, role, patient } = context;
  const rows = state.notifications.filter(
    (n) => n.role === role && (role !== "patient" || n.patient === patient),
  );
  return (
    heading(
      "The next step finds you.",
      "Requests and status changes arrive here as the other perspectives take action.",
    ) +
    (role === "patient" ? patientPicker(context) : "") +
    `<div class="panelhead"><p>${unread(state, role, patient)} unread updates${role === "patient" ? " for " + people[patient].name : ""}</p>${button("Mark all as read", "read-notices", "", "secondary")}</div>` +
    (rows.length
      ? `<div class="notice-list">${rows.map((n) => `<button class="notice ${n.read ? "" : "unread"}" data-action="open-notice" data-id="${n.id}"><span class="notice-symbol">${icon(n.view === "requests" ? "lock" : n.view === "prescriptions" ? "plus" : "bell")}</span><span><small>${people[n.patient].name} · ${date(n.at)}</small><strong>${n.title}</strong><span>${escape(n.detail)}</span>${n.read ? "" : "<em>New</em>"}</span>${icon("arrow")}</button>`).join("")}</div>`
      : empty(
          "You’re up to date",
          "Try an action in another perspective, then return to see the notification here.",
        ))
  );
}
