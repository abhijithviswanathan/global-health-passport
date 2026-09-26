import { createState } from "./workflow/initial-state.mjs";
import { WorkflowEngine } from "./workflow/engine.mjs";

/** Owns one tab's simulated records. Views receive detached, read-only-by-convention snapshots. */
export class DemoModel {
  #state;
  #engine;
  #createState;

  constructor(engine = new WorkflowEngine(), initialState = createState) {
    this.#engine = engine;
    this.#createState = initialState;
    this.reset();
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  execute(role, action, input = {}) {
    const result = this.#engine.execute(this.#state, role, action, input);
    this.#state = result.state;
    return result.feedback;
  }

  reset() {
    this.#state = this.#createState();
  }
}
