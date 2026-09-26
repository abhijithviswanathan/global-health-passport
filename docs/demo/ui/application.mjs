import { people, roles, taskTypes, medicine } from "../data.mjs";
import { hasScope, tourSteps } from "../store.mjs";
import { DemoModel } from "../model.mjs";
import { DemoNavigation } from "./navigation.mjs";
import { DemoFeedback } from "./feedback.mjs";
import { render as renderDocument } from "./views/shell.mjs";
import { button, personLine, reportTable } from "./components.mjs";
import { prescriptionCard } from "./views/prescriptions.mjs";

/**
 * Application controller: translates DOM events into model commands or navigation.
 * It owns no clinical rules; views receive snapshots and commands own validation.
 * Constructor injection lets tests substitute a model without mounting a backend.
 */
export class DemoApplication {
  #listeners;
  constructor(
    document,
    model = new DemoModel(),
    navigation = new DemoNavigation(),
  ) {
    this.document = document;
    this.model = model;
    this.navigation = navigation;
    this.root = document.querySelector("#app");
    this.feedback = new DemoFeedback(
      document.querySelector("#dialog"),
      document.querySelector("#toast"),
    );
  }

  get context() {
    return { state: this.model.snapshot(), ...this.navigation.snapshot() };
  }

  start() {
    this.stop();
    this.#listeners = new AbortController();
    const options = { signal: this.#listeners.signal };
    this.document.addEventListener("click", this.handleClick, options);
    this.document.addEventListener("change", this.handleChange, options);
    this.document.addEventListener("submit", this.handleSubmit, options);
    this.feedback.dialog.addEventListener("cancel", this.handleCancel, options);
    this.render();
  }

  stop() {
    this.#listeners?.abort();
    this.feedback.dispose();
  }

  render(focus = false) {
    this.root.innerHTML = renderDocument(this.context);
    if (focus)
      this.root.querySelector("#page-title")?.focus({ preventScroll: true });
  }

  perform(action, input = {}) {
    try {
      const { role, patient } = this.navigation.snapshot();
      const message = this.model.execute(role, action, { patient, ...input });
      if (this.feedback.dialog.open) this.feedback.close();
      this.render(true);
      this.feedback.toast(message);
      return true;
    } catch (error) {
      this.feedback.error(error.message);
      return false;
    }
  }

  navigate(role, view, patient) {
    this.navigation.go(role, view, patient);
    if (this.feedback.dialog.open) this.feedback.close();
    this.render(true);
    this.document.defaultView.scrollTo({ top: 0, behavior: "instant" });
  }

  continueTour(step) {
    this.navigation.showTour(true);
    const steps = tourSteps(this.model.snapshot());
    const next =
      step === undefined ? steps.find((step) => !step.done) : steps[step];
    this.navigate(next?.role || "patient", next?.view || "timeline", 0);
  }

  reset() {
    this.feedback.close();
    this.model.reset();
    this.navigation.reset();
    this.render(true);
    this.feedback.toast(
      "Fresh examples loaded. Ready for another presentation.",
    );
  }

  handleCancel = (event) => {
    event.preventDefault();
    this.feedback.close();
  };

  handleChange = (event) => {
    if (event.target.id === "role-select")
      this.navigate(event.target.value, roles[event.target.value].home);
    if (event.target.id === "patient-select") {
      this.navigation.selectPatient(Number(event.target.value));
      this.render(true);
    }
  };

  handleSubmit = (event) => {
    const form = event.target;
    if (!form.dataset.form) return;
    event.preventDefault();
    const data = new FormData(form);
    const inputs = {
      consent: [
        "decide-access",
        {
          id: form.dataset.id,
          decision: "approved",
          scopes: data.getAll("scope"),
          days: Number(data.get("days")),
        },
      ],
      task: [
        "assign-task",
        { type: form.dataset.type, priority: data.get("priority") },
      ],
      prescription: ["issue-prescription", { reviewed: data.has("reviewed") }],
    };
    const command = inputs[form.dataset.form];
    if (command) this.perform(...command);
  };

  handleClick = (event) => {
    const element = event.target.closest("[data-action]");
    if (!element || element.disabled) return;
    const { action, id } = element.dataset;
    const { role, patient, showTour, state } = this.context;
    // UI commands only route or collect input; model commands enforce workflow rules.
    const actions = {
      nav: () => this.navigate(role, element.dataset.view),
      home: () => this.navigate(role, roles[role].home),
      back: () => {
        this.navigation.back();
        this.render(true);
      },
      jump: () =>
        this.navigate(
          element.dataset.role,
          element.dataset.view,
          Number(element.dataset.patient ?? patient),
        ),
      "open-patient": () =>
        this.navigate(
          role === "doctor" ? "doctor" : "patient",
          role === "doctor" ? "patients" : "overview",
          Number(element.dataset.patient),
        ),
      "select-patient": () => {
        this.navigation.selectPatient(Number(element.dataset.patient));
        this.render();
      },
      "tour-toggle": () => {
        this.navigation.showTour(!showTour);
        this.render();
      },
      "tour-next": () => this.continueTour(),
      "tour-step": () => this.continueTour(Number(element.dataset.step)),
      "close-dialog": () => this.feedback.close(),
      about: () => this.aboutDialog(),
      menu: () =>
        this.feedback.open(
          "Demo menu",
          `<div class="action-stack">${button("About this demo", "about", "", "secondary")}${button("Restart with fresh examples", "reset-dialog", "", "secondary")}<a class="secondary" href="./demo-guide.html" target="_blank" rel="noopener">Presenter guide</a><a class="secondary" href="https://github.com/abhijithviswanathan/global-health-passport">Source & full app setup</a></div>`,
        ),
      "reset-dialog": () => {
        this.feedback.close();
        this.feedback.open(
          "Restart the demo?",
          `<p>This restores all fictional examples and clears the actions from this tab’s current session.</p><div class="buttonrow">${button("Reset demo", "reset-confirm")}${button("Keep exploring", "close-dialog", "", "secondary")}</div>`,
        );
      },
      "reset-confirm": () => this.reset(),
      "request-access": () => this.perform("request-access"),
      "decline-access": () =>
        this.perform("decide-access", { id, decision: "declined" }),
      "revoke-dialog": () =>
        this.feedback.open(
          "End this sharing?",
          `<p>Future doctor, nursing and pharmacy actions need a new approval. Your historical records remain in this fictional patient view.</p>${button("Confirm revoke", "revoke-confirm")}`,
        ),
      "revoke-confirm": () => this.perform("revoke-access"),
      "task-dialog": () => this.taskDialog(element.dataset.type),
      "task-advance": () => this.advanceTask(id),
      "task-confirm": () =>
        this.perform("advance-task", { id, confirmed: true }),
      "rx-dialog": () => this.prescriptionDialog(),
      "ack-prescription": () => this.perform("ack-prescription", { id }),
      "pharmacy-dialog": () => this.pharmacyDialog(id),
      "pharmacy-confirm": () =>
        this.perform("advance-prescription", { id, confirmed: true }),
      "print-rx": () =>
        this.feedback.open(
          "Printable sample — not a valid prescription",
          prescriptionCard(
            this.context,
            state.prescriptions.find((row) => row.id === id),
            true,
          ) + button("Print this fictional sample", "print"),
        ),
      print: () => this.document.defaultView.print(),
      "lab-advance": () => this.advanceLab(id),
      "lab-confirm": () => this.perform("advance-lab", { id, confirmed: true }),
      "review-report": () => this.perform("review-report", { id }),
      "invite-followup": () =>
        this.perform("invite-followup", {
          time: this.document.querySelector("#followup-time").value,
        }),
      "confirm-followup": () =>
        this.perform("reply-followup", { id, status: "confirmed" }),
      "reschedule-followup": () =>
        this.perform("reply-followup", { id, status: "reschedule_requested" }),
      "send-message": () => this.perform("send-message"),
      "read-notices": () => this.perform("read-notices"),
      "open-notice": () => {
        const notice = state.notifications.find((notice) => notice.id === id);
        if (this.perform("read-notice", { id, patient: notice.patient }))
          this.navigate(role, notice.view, notice.patient);
      },
    };
    if (Object.hasOwn(actions, action)) actions[action]();
  };

  advanceLab(id) {
    const lab = this.model.snapshot().labs.find((row) => row.id === id);
    if (lab.status === "received") return this.perform("advance-lab", { id });
    this.feedback.open(
      "Review & release the fictional report",
      `${personLine(people[lab.patient])}${reportTable()}<p>Releasing adds a report for the doctor and patient. The result still needs a separate doctor review.</p>${button("Confirm release", "lab-confirm", `data-id="${id}"`)}`,
    );
  }
  taskDialog(type) {
    const { state, patient } = this.context;

    if (!hasScope(state, patient, "care"))
      return this.feedback.toast("Patient sharing is needed first.");
    const t = taskTypes[type];
    this.feedback.open(
      "Send a nursing request",
      `<form data-form="task" data-type="${type}">${personLine(people[patient])}<div class="callout"><h3>${t.title}</h3><p>${t.detail}</p></div><dl class="review-list"><div><dt>Requester</dt><dd>Dr Smith · NorthStar Clinic</dd></div><div><dt>Assigned to</dt><dd>Nurse Williams</dd></div><div><dt>Due</dt><dd>11 September · 10:00 Eastern</dd></div></dl><label class="field">Priority<select name="priority"><option>Routine</option><option>Urgent</option></select></label><p class="muted">The nurse receives a new queue item and inbox notification. The patient receives a care update.</p><div class="buttonrow"><button class="primary" type="submit">Send request to nurse</button></div></form>`,
    );
  }

  prescriptionDialog() {
    const { patient } = this.context;

    this.feedback.open(
      "Review sample prescription",
      `<form data-form="prescription">${prescriptionCard(this.context, { id: "DRAFT", patient, medicine, createdAt: Date.parse("2026-09-11T08:00:00-04:00") }, true)}<label class="scope-option"><input type="checkbox" name="reviewed" required><span>I reviewed the fictional patient and sample prescription. This is an invented medicine, not clinical advice.</span></label><p class="muted">Review allergies in the shared chart before checking this box. This demo does not calculate interactions or recommend a medicine.</p><div class="buttonrow"><button class="primary" type="submit">Send sample prescription</button></div></form>`,
    );
  }

  advanceTask(id) {
    const { state } = this.context;

    const t = state.tasks.find((t) => t.id === id);
    if (t.status !== "in_progress") return this.perform("advance-task", { id });
    this.feedback.open(
      "Review the result before filing",
      `${personLine(people[t.patient])}<div class="callout"><h3>${taskTypes[t.type].title}</h3><p>${taskTypes[t.type].result}</p></div>${t.type === "vitals" ? '<div class="vitals"><div><strong>36.7 °C</strong><small>Temperature</small></div><div><strong>98%</strong><small>SpO₂</small></div><div><strong>74 bpm</strong><small>Pulse</small></div><div><strong>116/74</strong><small>BP · mmHg</small></div></div>' : ""}<p>Filing keeps observation and entry times separate. Doctor and patient views will show the update.</p>${button("Confirm & file sample result", "task-confirm", `data-id="${id}"`)}`,
    );
  }

  pharmacyDialog(id) {
    const { state } = this.context;

    const rx = state.prescriptions.find((r) => r.id === id),
      next = { sent: "reviewed", reviewed: "ready", ready: "dispensed" }[
        rx.status
      ];
    this.feedback.open(
      next === "dispensed"
        ? "Confirm sample collection"
        : next === "ready"
          ? "Prepare sample collection"
          : "Review the example order",
      `${personLine(people[rx.patient])}<div class="callout"><strong>${rx.medicine.name} · ${rx.medicine.strength}</strong><p>${rx.medicine.quantity} example tablets · Dr Smith · ${rx.id}</p></div><p>${next === "reviewed" ? "Confirm the example patient, prescription identity, directions and quantity. This is a manual demonstration check; no real clinical validation is performed." : next === "ready" ? "Confirm the fictional package is ready at Harbor Pharmacy. The patient will see a ready-for-collection update." : "Confirm the fictional patient collected the sample package. This is a collection record, not a dose administration."}</p>${button("Confirm pharmacy update", "pharmacy-confirm", `data-id="${id}"`)}`,
    );
  }

  aboutDialog() {
    this.feedback.open(
      "A connected care demonstration",
      `<p>Explore five perspectives with four invented patient stories. Actions share state within this browser tab, so a doctor’s request becomes a nurse’s task or a patient’s decision.</p><div class="callout"><strong>This GitHub Pages site is a public presentation.</strong><p>It has no real login, server, medical decision support, uploads or persistent records. Role switching is a demonstration control. All fixtures are public, including information hidden by simulated consent.</p></div><p>The full local application and its separate web/mobile setup are available in the repository. Refreshing or resetting this demo restores the examples.</p><div class="buttonrow"><a class="primary" href="./demo-guide.html" target="_blank" rel="noopener">Read the presenter guide</a><a class="secondary" href="https://github.com/abhijithviswanathan/global-health-passport">Source on GitHub</a></div>`,
    );
  }
}
