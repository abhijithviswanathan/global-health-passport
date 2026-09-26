/** Public workflow facade retained for callers and regression tests. */
import { WorkflowEngine } from "./workflow/engine.mjs";
export { createState } from "./workflow/initial-state.mjs";
export {
  timeNow,
  grantFor,
  hasScope,
  unread,
  auditFor,
} from "./workflow/selectors.mjs";
export { tourSteps } from "./workflow/journey.mjs";
const engine = new WorkflowEngine();
export function dispatch(state, role, action, input = {}) {
  return engine.execute(state, role, action, input);
}
