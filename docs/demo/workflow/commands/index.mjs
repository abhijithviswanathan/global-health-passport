import { accessCommands } from "./access.mjs";
import { nursingCommands } from "./nursing.mjs";
import { prescriptionsCommands } from "./prescriptions.mjs";
import { laboratoryCommands } from "./laboratory.mjs";
import { appointmentsCommands } from "./appointments.mjs";
import { communicationCommands } from "./communication.mjs";

/** Explicit registration makes new workflow actions discoverable without a central switch. */
export const commands = Object.freeze({
  ...accessCommands,
  ...nursingCommands,
  ...prescriptionsCommands,
  ...laboratoryCommands,
  ...appointmentsCommands,
  ...communicationCommands,
});
