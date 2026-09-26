/** Pure shell rendering: consumes a snapshot and returns HTML. */
import { patientPicker, tourPanel, icon, button } from "../components.mjs";
import { doctorHome, patientsView, doctorRequests } from "./doctor.mjs";
import { patientHome, sharingView } from "./patient.mjs";
import { nurseView, labView } from "./nursing.mjs";
import { reportsView, timelineView } from "./records.mjs";
import { prescriptionsView } from "./prescriptions.mjs";
import { appointmentsView, messagesView, inboxView } from "./communication.mjs";
import { navs } from "../navigation-config.mjs";
import { roles } from "../../data.mjs";
import { unread, tourSteps } from "../../store.mjs";

/** Render only the selected perspective. Public fixtures are not a real privacy boundary. */
export function render(context) {
  const { state, role, view, patient, trail, showTour } = context;
  const current = roles[role],
    steps = tourSteps(state),
    complete = steps.filter((s) => s.done).length;
  const title = navs[role].find((n) => n[0] === view)?.[1] || "Today";
  return `<div class="layout"><aside class="sidebar">
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
   ${view !== "inbox" && !(role === "doctor" && view === "overview") ? patientPicker(context) : ""}
   ${renderView(context)}
   <footer class="below"><span>All people, records and medicines are invented.</span><a href="./demo-guide.html" target="_blank" rel="noopener">Presenter guide</a></footer>
 </main></div></div>`;
}

export function renderView(context) {
  const { role, view } = context;
  if (view === "inbox") return inboxView(context);
  if (view === "prescriptions") return prescriptionsView(context);
  if (view === "reports") return reportsView(context);
  if (view === "appointments") return appointmentsView(context);
  if (view === "messages") return messagesView(context);
  if (view === "timeline") return timelineView(context);
  if (role === "doctor")
    return view === "overview"
      ? doctorHome(context)
      : view === "patients"
        ? patientsView(context)
        : doctorRequests(context);
  if (role === "patient")
    return view === "requests" ? sharingView(context) : patientHome(context);
  if (role === "nurse") return nurseView(context);
  return labView(context);
}
