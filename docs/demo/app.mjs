/**
 * Public demo presentation layer. See store.mjs for transitions and data.mjs for fixtures.
 * Everything runs in this tab's memory. Role switching illustrates the product; it is
 * not login or authorization. No patient data is collected or sent anywhere.
 */
import {
  people,
  roles,
  scopes,
  taskTypes,
  medicine,
  sampleReport,
} from "./data.mjs";
import {
  createState,
  dispatch,
  grantFor,
  hasScope,
  unread,
  auditFor,
  tourSteps,
} from "./store.mjs";

let state = createState();
// Navigation stays outside the workflow store so browsing does not complete clinical work.
let role = "doctor",
  view = "overview",
  patient = 0,
  trail = [],
  showTour = false;
let toastTimer, dialogReturnFocus;
const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (value) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(value) + " Eastern";
const label = (value) =>
  ({
    in_progress: "In progress",
    awaiting_review: "Awaiting doctor review",
    reschedule_requested: "Another time requested",
    sent: "Sent to pharmacy",
    dispensed: "Collection recorded",
  })[value] || value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const icon = (name) =>
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
const button = (text, action, attrs = "", style = "primary") =>
  `<button class="${style}" data-action="${action}" ${attrs}>${text}</button>`;
const badge = (status) =>
  `<span class="badge ${["completed", "confirmed", "reviewed", "dispensed", "approved", "ready"].includes(status) ? "green" : status === "declined" ? "gray" : "blue"}">${escape(label(status))}</span>`;
const empty = (title, detail) =>
  `<div class="empty">${icon("list")}<h3>${title}</h3><p>${detail}</p></div>`;
const heading = (title, detail) =>
  `<div class="pagehead"><div><h1 id="page-title" tabindex="-1">${title}</h1><p>${detail}</p></div></div>`;
const personLine = (p) =>
  `<div class="personline"><span class="avatar" aria-hidden="true">${p.initials}</span><div><h3>${escape(p.name)}</h3><small class="muted">${p.age} years · ID ${p.healthId}</small></div></div>`;
const navs = {
  doctor: [
    ["overview", "Today", "home"],
    ["patients", "Patients", "people"],
    ["requests", "Care requests", "list"],
    ["prescriptions", "Prescriptions", "plus"],
    ["reports", "Reports", "list"],
    ["appointments", "Schedule", "clock"],
    ["messages", "Messages", "mail"],
    ["inbox", "Inbox", "bell"],
  ],
  nurse: [
    ["queue", "My work queue", "list"],
    ["timeline", "Care timeline", "clock"],
    ["inbox", "Inbox", "bell"],
  ],
  patient: [
    ["overview", "My health", "heart"],
    ["requests", "Requests & sharing", "lock"],
    ["prescriptions", "Prescriptions", "plus"],
    ["reports", "My reports", "list"],
    ["appointments", "Appointments", "clock"],
    ["messages", "Messages", "mail"],
    ["timeline", "My timeline", "clock"],
    ["inbox", "Inbox", "bell"],
  ],
  pharmacy: [
    ["prescriptions", "Prescription queue", "plus"],
    ["inbox", "Inbox", "bell"],
  ],
  lab: [
    ["queue", "Sample queue", "list"],
    ["inbox", "Inbox", "bell"],
  ],
};

/** Render only the selected perspective. Public fixtures are not a real privacy boundary. */
function render(focus = false) {
  const current = roles[role],
    steps = tourSteps(state),
    complete = steps.filter((s) => s.done).length;
  const title = navs[role].find((n) => n[0] === view)?.[1] || "Today";
  app.innerHTML = `<div class="layout"><aside class="sidebar">
   <button class="brand" data-action="home" aria-label="Health Passport home"><span class="brandmark">${icon("heart")}</span><span>Health Passport<small>Connected care</small></span></button>
   <div><p class="eyebrow side-label">${current.title} workspace</p><nav class="nav" aria-label="${current.title} navigation">${navs[role].map(([v, text, i]) => `<button data-action="nav" data-view="${v}" class="${view === v ? "active" : ""}" ${view === v ? 'aria-current="page"' : ""}>${icon(i)}<span>${text}</span>${v === "inbox" && unread(state, role, patient) ? `<span class="count">${unread(state, role, patient)}</span>` : ""}</button>`).join("")}</nav></div>
   <div class="sidebottom"><p><span class="demo-dot"></span>Fictional care team</p><small class="muted">NorthStar Clinic<br>11 September 2026 · Eastern</small><button class="textbutton" data-action="about">About this demo</button></div>
 </aside><div class="workspace"><header class="topbar">
   <div class="breadcrumbs">${button(icon("back"), "back", `aria-label="Go back" ${trail.length ? "" : "disabled"}`, "iconbutton")}<span>${current.title} / ${title}</span></div>
   <div class="tools"><label class="role-label">Explore as<select id="role-select" aria-label="Demo perspective">${Object.entries(
     roles,
   )
     .map(
       ([key, r]) =>
         `<option value="${key}" ${role === key ? "selected" : ""}>${r.title}${unread(state, key, patient) ? " · " + unread(state, key, patient) + " new" : ""}</option>`,
     )
     .join(
       "",
     )}</select></label>${button(icon("menu"), "menu", 'aria-label="Open demo menu"', "iconbutton")}</div>
 </header><main id="main" class="content">
   <div class="demo-notice"><span><span class="demo-dot"></span>Fictional data · session demo · changes reset on reload</span><button class="textbutton" data-action="tour-toggle">${showTour ? "Hide" : "Show"} guided tour</button></div>
   ${showTour ? tourPanel(steps, complete) : `<div class="tour-banner"><div><strong>One patient. A connected care team.</strong><p>Follow Alice from a sharing request to her next appointment.</p></div>${button("Start guided story " + icon("arrow"), "tour-next")}</div>`}
   ${view !== "inbox" && !(role === "doctor" && view === "overview") ? patientPicker() : ""}
   ${renderView()}
   <footer class="below"><span>All people, records and medicines are invented.</span><a href="./demo-guide.html" target="_blank" rel="noopener">Presenter guide</a></footer>
 </main></div></div>`;
  if (focus)
    document.querySelector("#page-title")?.focus({ preventScroll: true });
}
function patientPicker() {
  return `<div class="patient-picker"><label for="patient-select">${role === "patient" ? "You are exploring as" : "Focus patient"}</label><select id="patient-select">${people.map((p) => `<option value="${p.id}" ${p.id === patient ? "selected" : ""}>${p.name} · ${p.healthId}</option>`).join("")}</select><span class="muted">${role === "patient" ? "Switch fictional accounts to compare their stories." : role === "nurse" || role === "pharmacy" || role === "lab" ? "Your queue also includes other assigned examples." : "One selection carries across the care workspace."}</span></div>`;
}
function tourPanel(steps, complete) {
  const next = steps.findIndex((s) => !s.done);
  return `<section class="tour-panel" aria-label="Guided story"><div class="panelhead"><div><p class="eyebrow">Alice’s care journey</p><h2>${complete === 9 ? "Story complete — the whole team is connected" : `${complete} of 9 steps completed`}</h2></div>${button(complete === 9 ? "See Alice’s timeline" : "Continue story " + icon("arrow"), "tour-next")}</div><div class="tour-track">${steps.map((s, i) => `<button data-action="tour-step" data-step="${i}" class="tour-step ${s.done ? "done" : ""} ${i === next ? "next" : ""}" aria-label="Step ${i + 1}: ${s.title}${s.done ? ", complete" : ""}"><span>${s.done ? icon("check") : i + 1}</span><small>${s.title}</small></button>`).join("")}</div><p class="muted">${next < 0 ? "Explore reports, messages or a different patient. Reset the demo to present again." : escape(steps[next].detail)} Every action updates the other perspectives.</p></section>`;
}
function renderView() {
  if (view === "inbox") return inboxView();
  if (view === "prescriptions") return prescriptionsView();
  if (view === "reports") return reportsView();
  if (view === "appointments") return appointmentsView();
  if (view === "messages") return messagesView();
  if (view === "timeline") return timelineView();
  if (role === "doctor")
    return view === "overview"
      ? doctorHome()
      : view === "patients"
        ? patientsView()
        : doctorRequests();
  if (role === "patient")
    return view === "requests" ? sharingView() : patientHome();
  if (role === "nurse") return nurseView();
  return labView();
}
function stats(items) {
  return `<div class="stats">${items.map(([value, text, i]) => `<div class="stat"><div><strong>${value}</strong><p>${text}</p></div><span class="symbol">${icon(i)}</span></div>`).join("")}</div>`;
}
function doctorHome() {
  return (
    heading(
      "A clearer day, Dr Smith.",
      "Your patients, incoming work and follow-ups — connected in one place.",
    ) +
    `<section class="hero"><div><p class="eyebrow">NorthStar Clinic · Friday</p><h2>Less chasing.<br>More time for care.</h2><p>Ask the patient once, delegate to the right teammate and watch results return to the same care story.</p>${button("Open Alice’s chart " + icon("arrow"), "open-patient", 'data-patient="0"')}</div><div class="hero-art"><div class="orbit">${icon("heart")}<div class="mini"><strong>5</strong>connected perspectives</div></div></div></section>` +
    stats([
      [4, "Morning visits", "people"],
      [
        state.tasks.filter((t) => t.status !== "completed").length,
        "Nursing tasks open",
        "list",
      ],
      [
        state.reports.filter(
          (r) =>
            r.status === "awaiting_review" &&
            hasScope(state, r.patient, "records"),
        ).length,
        "Reports to review",
        "list",
      ],
      [unread(state, "doctor", patient), "New updates", "bell"],
    ]) +
    `<div class="columns"><section class="panel"><div class="panelhead"><div><h2>Your morning, at a glance</h2><p>11 September · Eastern · 30-minute appointments</p></div>${button("Schedule", "nav", 'data-view="appointments"', "secondary")}</div>${agenda()}</section><section class="panel"><div class="panelhead"><h2>Where attention is needed</h2></div><div class="action-stack">${button("Review patient sharing " + icon("arrow"), "nav", 'data-view="patients"', "secondary")}${button("Send a nursing request " + icon("arrow"), "nav", 'data-view="requests"', "secondary")}${button("Review reports " + icon("arrow"), "nav", 'data-view="reports"', "secondary")}${button(`Open inbox (${unread(state, role, patient)})`, "nav", 'data-view="inbox"', "secondary")}</div><div class="callout"><strong>One update, several people informed.</strong><p>When the nurse files observations, the doctor sees completion and the patient gets a timeline update. Nobody needs to copy the same note into a second screen.</p></div></section></div>`
  );
}
function agenda() {
  return `<div class="agenda">${people.map((p) => `<div class="agenda-row"><time>${p.time}</time><button class="agenda-event" data-action="open-patient" data-patient="${p.id}"><strong>${p.name}</strong><span>${p.room} · 30 min</span><small>${grantFor(state, p.id) ? "Sharing active" : "Sharing needed before opening chart"}</small></button></div>`).join("")}<div class="agenda-row"><time>10:00</time><div class="agenda-gap">Care coordination & report review · 30 min</div></div></div>`;
}
function grantPrompt(scope) {
  const active = grantFor(state, patient),
    pending = state.requests.some(
      (r) => r.patient === patient && r.status === "pending",
    );
  return `<section class="panel lock-panel">${icon("lock")}<h2>${active ? "This information has not been shared" : "Let the patient decide what to share"}</h2><p>${active ? `The current grant does not include ${escape(scopes[scope]?.title || "this scope")}. The full guided story needs all three scopes. The patient can revoke and review a new request.` : `${people[patient].name} can approve specific information for a limited time, or decline.`}</p>${pending ? badge("pending") + "<p>The request is waiting in the patient’s Requests & sharing screen.</p>" : !active ? button("Request patient access", "request-access") : ""}${button("Explore patient response", "jump", 'data-role="patient" data-view="requests"', "secondary")}</section>`;
}
function patientsView() {
  return (
    heading(
      "Patients, with context.",
      "Choose a patient to prepare the visit, review their story and coordinate the next step.",
    ) +
    `<div class="patient-tabs">${people.map((p) => `<button data-action="select-patient" data-patient="${p.id}" class="patient-tab ${patient === p.id ? "selected" : ""}" aria-pressed="${patient === p.id}">${personLine(p)}<span class="badge ${grantFor(state, p.id) ? "green" : "gray"}">${grantFor(state, p.id) ? "Sharing active" : "Sharing needed"}</span></button>`).join("")}</div>` +
    (hasScope(state, patient, "records") ? chart() : grantPrompt("records"))
  );
}
function chart() {
  const p = people[patient];
  return `<section class="panel chart-summary"><div class="panelhead">${personLine(p)}<span class="pill">Fictional case sheet</span></div><p class="eyebrow">Reason for visit</p><h2>${p.story}</h2><p class="muted">${p.job} · ${p.room}</p><div class="callout warning"><strong>Allergies & reconciliation</strong><p>${p.allergy}</p></div>${vitals(p)}<div class="cards"><div class="record"><h3>Presenting illness & history</h3><p>${p.history}</p></div><div class="record"><h3>Consultation plan</h3><p>${p.plan}</p><h3>Previous consultation</h3><p>10 September 2026 · NorthStar Clinic. Fictional intake recorded; history requires clinician review. No confirmed diagnosis is asserted in this demo.</p></div></div><div class="buttonrow">${button(role === "patient" ? "Manage sharing" : "Coordinate care", "nav", 'data-view="requests"')}${button("Prescriptions", "nav", 'data-view="prescriptions"', "secondary")}${button("Reports", "nav", 'data-view="reports"', "secondary")}${button("Care timeline", "jump", 'data-role="patient" data-view="timeline"', "secondary")}</div></section>`;
}
function vitals(p) {
  const latest = state.observations.find((o) => o.patient === p.id),
    v = latest?.values || p.vitals;
  return `<div class="observations"><div class="panelhead"><h3>${latest ? "Latest nursing observations" : "Historical example observations"}</h3></div><div class="vitals"><div><strong>${v.temperature_c} °C</strong><small>Temperature</small></div><div><strong>${v.spo2_percent}%</strong><small>SpO₂</small></div><div><strong>${v.pulse_bpm} bpm</strong><small>Pulse</small></div><div><strong>${v.systolic_mmhg}/${v.diastolic_mmhg}</strong><small>BP · mmHg</small></div></div><small class="muted">${latest ? `Observed ${date(latest.observedAt)} · filed ${date(latest.recordedAt)} · ${latest.author}` : "Observed 10 September 2026, 08:00 Eastern · fictional intake. Historical values are not a new measurement."}</small></div>`;
}
function doctorRequests() {
  return (
    heading(
      "Delegate once. Stay in the loop.",
      "Nurse Williams receives the request in her queue and inbox. Completion comes back here.",
    ) +
    (hasScope(state, patient, "care")
      ? `<section class="panel"><div class="panelhead">${personLine(people[patient])}<span class="pill">Assigned nurse · Williams</span></div><div class="request-options">${Object.entries(
          taskTypes,
        )
          .map(
            ([type, t]) =>
              `<div class="request-option"><span class="symbol">${icon(type === "vitals" ? "heart" : type === "specimen" ? "list" : "clock")}</span><h3>${t.title}</h3><p>${t.detail}</p>${button("Create request", "task-dialog", `data-type="${type}" aria-label="Create ${type} request"`)}</div>`,
          )
          .join(
            "",
          )}</div></section><h2 class="section-title">Requests for ${people[patient].name}</h2>${tasksList(
          state.tasks.filter((t) => t.patient === patient),
          false,
        )}`
      : grantPrompt("care"))
  );
}
function tasksList(rows, actionable) {
  if (!rows.length)
    return empty(
      "No nursing requests yet",
      "Send a request from the doctor view, then open the nurse queue.",
    );
  return `<div class="work-cards">${rows
    .map((t) => {
      const tdef = taskTypes[t.type],
        allowed = hasScope(state, t.patient, "care");
      return `<article class="panel work-card ${t.patient === patient ? "focused" : ""}"><div class="panelhead">${personLine(people[t.patient])}${badge(t.status)}</div><div class="work-meta"><span>${t.priority} priority</span><span>Due ${t.due} Eastern</span><span>From Dr Smith</span></div><h2>${tdef.title}</h2><p>${tdef.detail}</p><div class="task-progress">${["requested", "accepted", "in_progress", "completed"].map((v, i) => `<span class="${i <= ["requested", "accepted", "in_progress", "completed"].indexOf(t.status) ? "reached" : ""}">${i + 1}. ${label(v)}</span>`).join("")}</div>${t.status === "completed" ? `<div class="callout"><strong>Filed ${date(t.completedAt)}</strong><p>${tdef.result}</p></div>` : actionable ? (allowed ? button(t.status === "requested" ? "Accept request" : t.status === "accepted" ? "Start task" : "Review & file result", "task-advance", `data-id="${t.id}"`) : '<p class="callout warning">Patient sharing ended. Ask the doctor to request renewed consent before continuing.</p>') : button("Show nurse’s queue", "jump", `data-role="nurse" data-view="queue" data-patient="${t.patient}"`, "secondary")}</article>`;
    })
    .join("")}</div>`;
}
function nurseView() {
  const rows = [...state.tasks].sort(
    (a, b) => (b.patient === patient) - (a.patient === patient),
  );
  return (
    heading(
      "Your next step is clear.",
      "Requests arrive with the patient, requester, due time and exactly what needs doing.",
    ) +
    stats([
      [
        rows.filter((t) => t.status === "requested").length,
        "New requests",
        "bell",
      ],
      [
        rows.filter((t) => ["accepted", "in_progress"].includes(t.status))
          .length,
        "Accepted / in progress",
        "clock",
      ],
      [
        rows.filter((t) => t.status === "completed").length,
        "Completed",
        "check",
      ],
      [unread(state, "nurse", patient), "Inbox updates", "mail"],
    ]) +
    tasksList(rows, true)
  );
}
function patientHome() {
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
    `<div class="cards"><section class="panel"><h2>Your next steps</h2><div class="action-stack">${button("Read prescription directions", "nav", 'data-view="prescriptions"', "secondary")}${button("See appointments", "nav", 'data-view="appointments"', "secondary")}${button("Message Dr Smith", "nav", 'data-view="messages"', "secondary")}${button("Open your timeline", "nav", 'data-view="timeline"', "secondary")}</div></section><section class="panel"><h2>Care team</h2><div class="team-list"><p><strong>Dr Smith</strong><span>Consultation & follow-up · NorthStar Clinic</span></p><p><strong>Nurse Williams</strong><span>Observations & coordination</span></p><p><strong>Harbor Pharmacy</strong><span>Sample prescriptions & collection</span></p></div></section></div><h2 class="section-title">Your health summary</h2>${chart()}`
  );
}
function sharingView() {
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

/** One prescription card is reused across doctor, patient and pharmacy with different controls. */
function prescriptionsView() {
  const p = people[patient],
    isDoctor = role === "doctor";
  if (isDoctor && !hasScope(state, patient, "prescriptions"))
    return (
      heading(
        "Prescriptions, end to end.",
        "From a reviewed example to the patient’s directions and pharmacy collection.",
      ) + grantPrompt("prescriptions")
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
      ? rows.map((rx) => prescriptionCard(rx)).join("")
      : empty(
          "No prescription here yet",
          "After patient approval, Dr Smith can review and send a sample prescription. It will appear here and in the pharmacy queue.",
        ))
  );
}
function prescriptionCard(rx, preview = false) {
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
function reportsView() {
  if (role === "doctor" && !hasScope(state, patient, "records"))
    return (
      heading(
        "Reports, without the file hunt.",
        "See the specimen date, upload date and review state together.",
      ) + grantPrompt("records")
    );
  const rows = state.reports.filter((r) => r.patient === patient);
  return (
    heading(
      role === "patient"
        ? "Your reports, in one place."
        : "Reports, without the file hunt.",
      "Observation time and entry time stay separate. A result is not automatically a diagnosis.",
    ) +
    (rows.length
      ? rows
          .map(
            (r) =>
              `<section class="panel report"><div class="panelhead"><div><p class="eyebrow">NorthStar Laboratory · ${r.id}</p><h2>${sampleReport.name}</h2></div>${badge(r.status)}</div><p>${people[patient].name} · ${sampleReport.specimen}</p><div class="report-dates"><p><strong>Specimen / observation time</strong><span>${date(r.observedAt)}</span></p><p><strong>Entered into record</strong><span>${date(r.createdAt)}</span></p></div>${reportTable()}<div class="callout"><strong>${r.status === "reviewed" ? "Reviewed by Dr Smith" : "Awaiting Dr Smith’s review"}</strong><p>Fictional numbers demonstrate a report layout. No reference ranges, diagnostic conclusions or treatment recommendations are inferred.</p></div>${role === "doctor" && r.status === "awaiting_review" ? button("Record my review", "review-report", `data-id="${r.id}"`) : ""}</section>`,
          )
          .join("")
      : empty(
          "No reports available yet",
          "The doctor can request sample collection, the nurse completes collection, and the laboratory releases a fictional report.",
        ))
  );
}
function reportTable() {
  return `<div class="tablewrap"><table class="data-table"><caption>Fictional CBC values — presentation only</caption><thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Unit</th></tr></thead><tbody>${sampleReport.values.map((row) => `<tr>${row.map((v, i) => (i === 0 ? `<th scope="row">${v}</th>` : `<td>${v}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function labView() {
  return (
    heading(
      "Samples in. Clear updates out.",
      "The nurse’s collection task hands the example to the lab; releasing the report alerts doctor and patient.",
    ) +
    (state.labs.length
      ? `<div class="work-cards">${state.labs.map((l) => `<section class="panel"><div class="panelhead">${personLine(people[l.patient])}${badge(l.status)}</div><h2>Complete blood count</h2><p>Requested by Dr Smith · collected by Nurse Williams</p><p class="muted">${sampleReport.specimen} · received ${date(l.createdAt)}</p><div class="callout"><strong>Keep the handoff visible</strong><p>Received → Processing → Report released → Doctor review. Collection and report review are separate steps.</p></div>${l.status === "reported" ? '<p class="badge green">Report released to doctor and patient</p>' : hasScope(state, l.patient, "care") ? button(l.status === "received" ? "Start processing" : "Review & release sample report", "lab-advance", `data-id="${l.id}"`) : '<p class="callout warning">Patient sharing ended. Renew care sharing before continuing.</p>'}</section>`).join("")}</div>`
      : empty(
          "Waiting for a collected sample",
          "Switch to the nurse and complete a sample-collection request. It will arrive here automatically.",
        ))
  );
}
function appointmentsView() {
  const rows = state.appointments.filter((a) => a.patient === patient);
  return (
    heading(
      role === "patient"
        ? "Your next visit, together."
        : "A schedule that closes the loop.",
      "An invitation becomes a confirmed appointment only after the patient responds.",
    ) +
    (role === "doctor"
      ? `<div class="columns"><section class="panel"><div class="panelhead"><h2>Friday · 11 September</h2><span class="pill">Eastern time</span></div>${agenda()}</section><section class="panel"><h2>Arrange a follow-up</h2><p>${people[patient].name} · Dr Smith · NorthStar Clinic</p><div class="appointment-date"><strong>18</strong><span>September 2026<br>Eastern time · Room 2</span></div><label class="field" for="followup-time">Proposed time<select id="followup-time"><option value="10:30">10:30–11:00</option><option value="14:00">14:00–14:30</option></select></label>${hasScope(state, patient, "care") ? button("Invite patient to follow-up", "invite-followup") : '<p class="callout">Approve Nursing & follow-up sharing first.</p>'}</section></div>`
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
function messagesView() {
  if (role === "doctor" && !hasScope(state, patient, "care"))
    return (
      heading(
        "A conversation with context.",
        "Messages stay attached to the fictional patient.",
      ) + grantPrompt("care")
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
function timelineView() {
  const rows = auditFor(state, patient),
    nurse = role === "nurse";
  const visible = nurse
    ? rows.filter(
        (e) =>
          e.title.startsWith("Nursing") || e.title.startsWith("Laboratory"),
      )
    : rows;
  return (
    heading(
      `${people[patient].name.split(" ")[0]}’s care timeline.`,
      nurse
        ? "Nursing and specimen handoff events for the focus patient."
        : "One story across requests, observations, prescriptions, reports and follow-up.",
    ) +
    (nurse && !hasScope(state, patient, "care")
      ? empty(
          "Sharing is needed",
          "This patient has not shared nursing coordination information.",
        )
      : `<section class="panel"><ol class="care-timeline">${visible.map((e) => `<li><span class="timeline-dot">${icon("check")}</span><div><small>${date(e.at)} · ${e.actor}</small><h3>${e.title}</h3><p>${e.detail}</p></div></li>`).join("")}${nurse ? "" : `<li><span class="timeline-dot">${icon("list")}</span><div><small>10 September 2026 · Fictional intake</small><h3>Health story created</h3><p>Historical intake, reported allergies and previous consultation added as presentation examples.</p></div></li>`}</ol>${nurse && !visible.length ? empty("No nursing activity yet", "Accept or complete a request to add its event here.") : ""}</section>`)
  );
}
function inboxView() {
  const rows = state.notifications.filter(
    (n) => n.role === role && (role !== "patient" || n.patient === patient),
  );
  return (
    heading(
      "The next step finds you.",
      "Requests and status changes arrive here as the other perspectives take action.",
    ) +
    (role === "patient" ? patientPicker() : "") +
    `<div class="panelhead"><p>${unread(state, role, patient)} unread updates${role === "patient" ? " for " + people[patient].name : ""}</p>${button("Mark all as read", "read-notices", "", "secondary")}</div>` +
    (rows.length
      ? `<div class="notice-list">${rows.map((n) => `<button class="notice ${n.read ? "" : "unread"}" data-action="open-notice" data-id="${n.id}"><span class="notice-symbol">${icon(n.view === "requests" ? "lock" : n.view === "prescriptions" ? "plus" : "bell")}</span><span><small>${people[n.patient].name} · ${date(n.at)}</small><strong>${n.title}</strong><span>${escape(n.detail)}</span>${n.read ? "" : "<em>New</em>"}</span>${icon("arrow")}</button>`).join("")}</div>`
      : empty(
          "You’re up to date",
          "Try an action in another perspective, then return to see the notification here.",
        ))
  );
}

/** Dialogs ask users to review concrete sample results before filing or dispatching them. */
function openDialog(title, body) {
  if (!dialog.open) dialogReturnFocus = document.activeElement;
  dialog.innerHTML = `<div class="dialoghead"><h2 id="dialog-title">${title}</h2>${button("×", "close-dialog", 'aria-label="Close dialog"', "iconbutton")}</div><div class="dialogbody"><p id="dialog-error" class="callout warning" role="alert" hidden></p>${body}</div>`;
  if (!dialog.open) dialog.showModal();
}
function closeDialog() {
  dialog.close();
  dialog.innerHTML = "";
  dialogReturnFocus?.isConnected && dialogReturnFocus.focus();
}
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 5500);
}
function perform(action, input = {}, close = true) {
  try {
    const next = dispatch(state, role, action, { patient, ...input });
    state = next.state;
    if (close && dialog.open) closeDialog();
    render(true);
    toast(next.feedback);
    return true;
  } catch (error) {
    if (dialog.open) {
      const errorBox = dialog.querySelector("#dialog-error");
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    } else toast(error.message);
    return false;
  }
}
function navigate(nextRole, nextView, nextPatient = patient) {
  trail.push({ role, view, patient });
  role = nextRole;
  view = nextView;
  patient = nextPatient;
  if (dialog.open) closeDialog();
  render(true);
  window.scrollTo({ top: 0, behavior: "instant" });
}
function taskDialog(type) {
  if (!hasScope(state, patient, "care"))
    return toast("Patient sharing is needed first.");
  const t = taskTypes[type];
  openDialog(
    "Send a nursing request",
    `<form data-form="task" data-type="${type}">${personLine(people[patient])}<div class="callout"><h3>${t.title}</h3><p>${t.detail}</p></div><dl class="review-list"><div><dt>Requester</dt><dd>Dr Smith · NorthStar Clinic</dd></div><div><dt>Assigned to</dt><dd>Nurse Williams</dd></div><div><dt>Due</dt><dd>11 September · 10:00 Eastern</dd></div></dl><label class="field">Priority<select name="priority"><option>Routine</option><option>Urgent</option></select></label><p class="muted">The nurse receives a new queue item and inbox notification. The patient receives a care update.</p><div class="buttonrow"><button class="primary" type="submit">Send request to nurse</button></div></form>`,
  );
}
function prescriptionDialog() {
  openDialog(
    "Review sample prescription",
    `<form data-form="prescription">${prescriptionCard({ id: "DRAFT", patient, medicine, createdAt: Date.parse("2026-09-11T08:00:00-04:00") }, true)}<label class="scope-option"><input type="checkbox" name="reviewed" required><span>I reviewed the fictional patient and sample prescription. This is an invented medicine, not clinical advice.</span></label><p class="muted">Review allergies in the shared chart before checking this box. This demo does not calculate interactions or recommend a medicine.</p><div class="buttonrow"><button class="primary" type="submit">Send sample prescription</button></div></form>`,
  );
}
function advanceTask(id) {
  const t = state.tasks.find((t) => t.id === id);
  if (t.status !== "in_progress") return perform("advance-task", { id });
  openDialog(
    "Review the result before filing",
    `${personLine(people[t.patient])}<div class="callout"><h3>${taskTypes[t.type].title}</h3><p>${taskTypes[t.type].result}</p></div>${t.type === "vitals" ? '<div class="vitals"><div><strong>36.7 °C</strong><small>Temperature</small></div><div><strong>98%</strong><small>SpO₂</small></div><div><strong>74 bpm</strong><small>Pulse</small></div><div><strong>116/74</strong><small>BP · mmHg</small></div></div>' : ""}<p>Filing keeps observation and entry times separate. Doctor and patient views will show the update.</p>${button("Confirm & file sample result", "task-confirm", `data-id="${id}"`)}`,
  );
}
function pharmacyDialog(id) {
  const rx = state.prescriptions.find((r) => r.id === id),
    next = { sent: "reviewed", reviewed: "ready", ready: "dispensed" }[
      rx.status
    ];
  openDialog(
    next === "dispensed"
      ? "Confirm sample collection"
      : next === "ready"
        ? "Prepare sample collection"
        : "Review the example order",
    `${personLine(people[rx.patient])}<div class="callout"><strong>${rx.medicine.name} · ${rx.medicine.strength}</strong><p>${rx.medicine.quantity} example tablets · Dr Smith · ${rx.id}</p></div><p>${next === "reviewed" ? "Confirm the example patient, prescription identity, directions and quantity. This is a manual demonstration check; no real clinical validation is performed." : next === "ready" ? "Confirm the fictional package is ready at Harbor Pharmacy. The patient will see a ready-for-collection update." : "Confirm the fictional patient collected the sample package. This is a collection record, not a dose administration."}</p>${button("Confirm pharmacy update", "pharmacy-confirm", `data-id="${id}"`)}`,
  );
}
function aboutDialog() {
  openDialog(
    "A connected care demonstration",
    `<p>Explore five perspectives with four invented patient stories. Actions share state within this browser tab, so a doctor’s request becomes a nurse’s task or a patient’s decision.</p><div class="callout"><strong>This GitHub Pages site is a public presentation.</strong><p>It has no real login, server, medical decision support, uploads or persistent records. Role switching is a demonstration control. All fixtures are public, including information hidden by simulated consent.</p></div><p>The full local application and its separate web/mobile setup are available in the repository. Refreshing or resetting this demo restores the examples.</p><div class="buttonrow"><a class="primary" href="./demo-guide.html" target="_blank" rel="noopener">Read the presenter guide</a><a class="secondary" href="https://github.com/abhijithviswanathan/global-health-passport">Source on GitHub</a></div>`,
  );
}

// Event delegation keeps rerendered cards and dialogs connected to the same workflow actions.
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const { action, id } = el.dataset;
  if (el.disabled) return;
  switch (action) {
    case "nav":
      return navigate(role, el.dataset.view);
    case "home":
      return navigate(role, roles[role].home);
    case "back": {
      const previous = trail.pop();
      if (previous) {
        ({ role, view, patient } = previous);
        render(true);
      }
      return;
    }
    case "jump":
      return navigate(
        el.dataset.role,
        el.dataset.view,
        Number(el.dataset.patient ?? patient),
      );
    case "open-patient":
      return navigate(
        role === "doctor" ? "doctor" : "patient",
        role === "doctor" ? "patients" : "overview",
        Number(el.dataset.patient),
      );
    case "select-patient":
      patient = Number(el.dataset.patient);
      return render();
    case "tour-toggle":
      showTour = !showTour;
      return render();
    case "tour-next": {
      showTour = true;
      const next = tourSteps(state).find((s) => !s.done);
      return navigate(next?.role || "patient", next?.view || "timeline", 0);
    }
    case "tour-step": {
      const s = tourSteps(state)[Number(el.dataset.step)];
      return navigate(s.role, s.view, 0);
    }
    case "close-dialog":
      return closeDialog();
    case "about":
      return aboutDialog();
    case "menu":
      return openDialog(
        "Demo menu",
        `<div class="action-stack">${button("About this demo", "about", "", "secondary")}${button("Restart with fresh examples", "reset-dialog", "", "secondary")}<a class="secondary" href="./demo-guide.html" target="_blank" rel="noopener">Presenter guide</a><a class="secondary" href="https://github.com/abhijithviswanathan/global-health-passport">Source & full app setup</a></div>`,
      );
    case "reset-dialog":
      closeDialog();
      return openDialog(
        "Restart the demo?",
        `<p>This restores all fictional examples and clears the actions from this tab’s current session.</p><div class="buttonrow">${button("Reset demo", "reset-confirm")}${button("Keep exploring", "close-dialog", "", "secondary")}</div>`,
      );
    case "reset-confirm":
      closeDialog();
      state = createState();
      role = "doctor";
      view = "overview";
      patient = 0;
      trail = [];
      showTour = false;
      render(true);
      return toast("Fresh examples loaded. Ready for another presentation.");
    case "request-access":
      return perform("request-access");
    case "decline-access":
      return perform("decide-access", { id, decision: "declined" });
    case "revoke-dialog":
      return openDialog(
        "End this sharing?",
        `<p>Future doctor, nursing and pharmacy actions need a new approval. Your historical records remain in this fictional patient view.</p>${button("Confirm revoke", "revoke-confirm")}`,
      );
    case "revoke-confirm":
      return perform("revoke-access");
    case "task-dialog":
      return taskDialog(el.dataset.type);
    case "task-advance":
      return advanceTask(id);
    case "task-confirm":
      return perform("advance-task", { id, confirmed: true });
    case "rx-dialog":
      return prescriptionDialog();
    case "ack-prescription":
      return perform("ack-prescription", { id });
    case "pharmacy-dialog":
      return pharmacyDialog(id);
    case "pharmacy-confirm":
      return perform("advance-prescription", { id, confirmed: true });
    case "print-rx": {
      const rx = state.prescriptions.find((r) => r.id === id);
      openDialog(
        "Printable sample — not a valid prescription",
        prescriptionCard(rx, true) +
          button("Print this fictional sample", "print"),
      );
      return;
    }
    case "print":
      return window.print();
    case "lab-advance": {
      const l = state.labs.find((r) => r.id === id);
      if (l.status === "received") return perform("advance-lab", { id });
      return openDialog(
        "Review & release the fictional report",
        `${personLine(people[l.patient])}${reportTable()}<p>Releasing adds a report for the doctor and patient. The result still needs a separate doctor review.</p>${button("Confirm release", "lab-confirm", `data-id="${id}"`)}`,
      );
    }
    case "lab-confirm":
      return perform("advance-lab", { id, confirmed: true });
    case "review-report":
      return perform("review-report", { id });
    case "invite-followup":
      return perform("invite-followup", {
        time: document.querySelector("#followup-time").value,
      });
    case "confirm-followup":
      return perform("reply-followup", { id, status: "confirmed" });
    case "reschedule-followup":
      return perform("reply-followup", { id, status: "reschedule_requested" });
    case "send-message":
      return perform("send-message");
    case "read-notices":
      return perform("read-notices");
    case "open-notice": {
      const n = state.notifications.find((n) => n.id === id);
      perform("read-notice", { id, patient: n.patient });
      return navigate(role, n.view, n.patient);
    }
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "role-select")
    navigate(event.target.value, roles[event.target.value].home);
  if (event.target.id === "patient-select") {
    patient = Number(event.target.value);
    render(true);
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === "consent")
    perform("decide-access", {
      id: form.dataset.id,
      decision: "approved",
      scopes: data.getAll("scope"),
      days: Number(data.get("days")),
    });
  if (form.dataset.form === "task")
    perform("assign-task", {
      type: form.dataset.type,
      priority: data.get("priority"),
    });
  if (form.dataset.form === "prescription")
    perform("issue-prescription", { reviewed: data.has("reviewed") });
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
render();
