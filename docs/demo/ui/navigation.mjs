import { people, roles } from "../data.mjs";
import { navs } from "./navigation-config.mjs";

/** Navigation history is separate from patient workflow data; visiting a page completes no work. */
export class DemoNavigation {
  #current;
  #trail;
  #showTour;

  constructor() {
    this.reset();
  }

  snapshot() {
    return {
      ...this.#current,
      trail: this.#trail.map((entry) => ({ ...entry })),
      showTour: this.#showTour,
    };
  }

  go(role, view, patient = this.#current.patient) {
    if (!roles[role] || !navs[role].some(([section]) => section === view))
      throw new Error("Choose an available demo page.");
    this.#validatePatient(patient);
    this.#trail.push({ ...this.#current });
    this.#current = { role, view, patient };
  }

  back() {
    if (this.#trail.length) this.#current = this.#trail.pop();
  }

  selectPatient(patient) {
    this.#validatePatient(patient);
    this.#current = { ...this.#current, patient };
  }

  showTour(visible) {
    this.#showTour = visible;
  }

  reset() {
    this.#current = { role: "doctor", view: "overview", patient: 0 };
    this.#trail = [];
    this.#showTour = false;
  }

  #validatePatient(patient) {
    if (!people.some((person) => person.id === patient))
      throw new Error("Choose a fictional patient.");
  }
}
