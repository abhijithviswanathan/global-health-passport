/** Pure components rendering: consumes a snapshot and returns HTML. */
import { people, sampleReport } from "../data.mjs";

export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const date = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(value) + " Eastern";
export const label = (value) =>
  ({
    in_progress: "In progress",
    awaiting_review: "Awaiting doctor review",
    reschedule_requested: "Another time requested",
    sent: "Sent to pharmacy",
    dispensed: "Collection recorded",
  })[value] || value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24">${
    {
      home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
      people:
        '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
      heart:
        '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-5 5 1 10 8 16 7-6 13-11 8-16Z"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
      list: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM9 11h6M9 16h6"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
      bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4"/>',
      back: '<path d="m14 5-7 7 7 7"/>',
      arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
    }[name] || '<circle cx="12" cy="12" r="8"/>'
  }</svg>`;
export const button = (text, action, attrs = "", style = "primary") =>
  `<button class="${style}" data-action="${action}" ${attrs}>${text}</button>`;
export const badge = (status) =>
  `<span class="badge ${["completed", "confirmed", "reviewed", "dispensed", "approved", "ready"].includes(status) ? "green" : status === "declined" ? "gray" : "blue"}">${escape(label(status))}</span>`;
export const empty = (title, detail) =>
  `<div class="empty">${icon("list")}<h3>${title}</h3><p>${detail}</p></div>`;
export const heading = (title, detail) =>
  `<div class="pagehead"><div><h1 id="page-title" tabindex="-1">${title}</h1><p>${detail}</p></div></div>`;
export const personLine = (p) =>
  `<div class="personline"><span class="avatar" aria-hidden="true">${p.initials}</span><div><h3>${escape(p.name)}</h3><small class="muted">${p.age} years · ID ${p.healthId}</small></div></div>`;

export function patientPicker(context) {
  const { role, patient } = context;
  return `<div class="patient-picker"><label for="patient-select">${role === "patient" ? "You are exploring as" : "Focus patient"}</label><select id="patient-select">${people.map((p) => `<option value="${p.id}" ${p.id === patient ? "selected" : ""}>${p.name} · ${p.healthId}</option>`).join("")}</select><span class="muted">${role === "patient" ? "Switch fictional accounts to compare their stories." : role === "nurse" || role === "pharmacy" || role === "lab" ? "Your queue also includes other assigned examples." : "One selection carries across the care workspace."}</span></div>`;
}

export function tourPanel(steps, complete) {
  const next = steps.findIndex((s) => !s.done);
  return `<section class="tour-panel" aria-label="Guided story"><div class="panelhead"><div><p class="eyebrow">Alice’s care journey</p><h2>${complete === 9 ? "Story complete — the whole team is connected" : `${complete} of 9 steps completed`}</h2></div>${button(complete === 9 ? "See Alice’s timeline" : "Continue story " + icon("arrow"), "tour-next")}</div><div class="tour-track">${steps.map((s, i) => `<button data-action="tour-step" data-step="${i}" class="tour-step ${s.done ? "done" : ""} ${i === next ? "next" : ""}" aria-label="Step ${i + 1}: ${s.title}${s.done ? ", complete" : ""}"><span>${s.done ? icon("check") : i + 1}</span><small>${s.title}</small></button>`).join("")}</div><p class="muted">${next < 0 ? "Explore reports, messages or a different patient. Reset the demo to present again." : escape(steps[next].detail)} Every action updates the other perspectives.</p></section>`;
}

export function stats(items) {
  return `<div class="stats">${items.map(([value, text, i]) => `<div class="stat"><div><strong>${value}</strong><p>${text}</p></div><span class="symbol">${icon(i)}</span></div>`).join("")}</div>`;
}

export function reportTable() {
  return `<div class="tablewrap"><table class="data-table"><caption>Fictional CBC values — presentation only</caption><thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Unit</th></tr></thead><tbody>${sampleReport.values.map((row) => `<tr>${row.map((v, i) => (i === 0 ? `<th scope="row">${v}</th>` : `<td>${v}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
}
