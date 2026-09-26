import { commands } from "./commands/index.mjs";
import { WorkflowTransaction } from "./transaction.mjs";

/** Command dispatcher. A failed handler leaves its caller's state untouched. */
export class WorkflowEngine {
  #commands;

  constructor(handlers = commands) {
    this.#commands = new Map(Object.entries(handlers));
  }

  execute(state, role, action, input = {}) {
    const handle = this.#commands.get(action);
    if (!handle) throw new Error("Unknown demo action.");
    const transaction = new WorkflowTransaction(state, role, input.patient);
    const feedback = handle(transaction, input);
    return transaction.commit(feedback);
  }
}
